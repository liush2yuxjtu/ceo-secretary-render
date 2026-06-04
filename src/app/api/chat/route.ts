// POST /api/chat — stream a chat completion from CEO秘书.
//
// v4.1 (portable orchestrator): the previous version (v4.0.0) ran the
// Anthropic Agent SDK inside a Vercel Sandbox microVM, with the
// Function merely orchestrating JSONL-over-stdout. v4.1 replaces the
// sandbox with two direct-fetch paths in the same Function:
//
//   1. Main thread: a /v1/messages call with the CEO秘书 system prompt
//      and a `Task` tool definition. When the main agent emits
//      tool_use for Task, we (2) below.
//   2. Subagent dispatch: POST /api/plugin/{pluginId} with the task
//      message; that route is a thin /v1/messages wrapper that loads
//      the plugin's system prompt and returns the text.
//
// Same wire shape as v4.0.0: SSE stream of {start, delta, hotload,
// hotload_done, message, done, error} events. The 504-line v4 file
// shrinks to ~300 because we no longer have a sandbox lifecycle to
// manage.

import { NextRequest } from 'next/server';
import {
  MAIN_ROLE_ID,
  getMainRole,
  resolveRolePaths,
  type Role,
} from '@/lib/roles';
import type { ChatStreamEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // seconds

// Hard ceiling on the wall clock of one chat turn. Mirrors v0.2.0.
const HARD_TIMEOUT_MS = 120_000;
const MAX_TURNS = 6; // matches SDK default
const MAX_TASK_DEPTH = 1; // matches SDK default — no sub-spawning

// ── SSE helpers (route → client) ──────────────────────────────────────────
function sse(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function preview(text: string, max = 200): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

// Strip YAML frontmatter from agent markdown prompts.
function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

// ── Plugin prompt loading (Function-side) ────────────────────────────────
async function loadAgentPrompt(pluginPath: string, agentName: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const file = `${pluginPath}/agents/${agentName}.md`;
  const raw = await readFile(file, 'utf8');
  return stripFrontmatter(raw);
}

// Task tool definition. The model is told it can dispatch a subagent by
// emitting tool_use for this tool with a subagent_type and a prompt.
const TASK_TOOL = {
  name: 'Task',
  description:
    'Spawn a specialized subagent to handle part of the task. Use this when ' +
    'a question matches a known role (e.g. CTO for architecture, designer for ' +
    'UI, finance-controller for budgets). subagent_type is the kebab-case role id; ' +
    'prompt is the full instruction to send to the subagent.',
  input_schema: {
    type: 'object' as const,
    properties: {
      subagent_type: {
        type: 'string',
        description:
          'The role id to dispatch to (e.g. "cto-advisor", "designer", "finance-controller").',
      },
      prompt: {
        type: 'string',
        description: 'The full instruction to send to the subagent.',
      },
      description: {
        type: 'string',
        description: 'A short label for the user, optional.',
      },
    },
    required: ['subagent_type', 'prompt'],
  },
};

// ── Upstream call to /v1/messages (non-streaming for v4.1) ───────────────
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

type UpstreamResponse = {
  content: ContentBlock[];
  stop_reason?: string;
  model?: string;
  usage?: unknown;
};

async function callUpstream(args: {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
  tools?: unknown[];
  maxTokens?: number;
}): Promise<UpstreamResponse> {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const token =
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  const model = process.env.ANTHROPIC_MODEL || 'MiniMax-M3';
  if (!baseUrl || !token) {
    throw new Error('Missing ANTHROPIC_BASE_URL or ANTHROPIC_API_KEY env');
  }
  const r = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
    },
    body: JSON.stringify({
      model,
      max_tokens: args.maxTokens ?? 4096,
      system: [
        {
          type: 'text',
          text: args.system,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: args.tools,
      messages: args.messages,
    }),
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`upstream ${r.status}: ${errText.slice(0, 500)}`);
  }
  return (await r.json()) as UpstreamResponse;
}

// ── Subagent dispatch: POST /api/plugin/{pluginId} ────────────────────────
async function dispatchSubagent(
  baseUrl: string,
  pluginId: string,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const url = `${baseUrl}/api/plugin/${encodeURIComponent(pluginId)}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: prompt }),
    signal,
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`subagent ${pluginId} ${r.status}: ${errText.slice(0, 500)}`);
  }
  const data = (await r.json()) as { text?: string; error?: string };
  if (typeof data.text !== 'string') {
    throw new Error(`subagent ${pluginId} returned no text: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data.text;
}

// ── Route handler ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return new Response('Missing message', { status: 400 });
  const sessionId = body.sessionId;

  const startedAt = Date.now();

  // Load the main agent's system prompt up front. We also pre-build a
  // directory of available subagent IDs so we can refuse unknown ones.
  const roles = await resolveRolePaths();
  const mainRole = roles.find((r) => r.id === MAIN_ROLE_ID) ?? getMainRole();
  if (!mainRole.pluginPath) {
    return new Response('main role plugin not installed', { status: 424 });
  }
  const subagentIds = new Set(
    roles.filter((r) => r.id !== MAIN_ROLE_ID).map((r) => r.id),
  );
  let mainSystemPrompt: string;
  try {
    mainSystemPrompt = await loadAgentPrompt(mainRole.pluginPath, mainRole.agentName);
  } catch (e) {
    return new Response(
      `cannot read main agent prompt: ${(e as Error).message}`,
      { status: 424 },
    );
  }

  // Figure out the base URL for in-process subagent dispatch. On any
  // Next.js host, the route receives a request and we can echo the
  // request's own scheme + host back as the internal base.
  const reqUrl = new URL(req.url);
  const internalBase = `${reqUrl.protocol}//${reqUrl.host}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch {
          /* client disconnected */
        }
      };
      const send = (e: ChatStreamEvent) => safeEnqueue(sse(e));

      const ac = new AbortController();
      let timedOut = false;
      const hardTimer = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, HARD_TIMEOUT_MS);

      send({ type: 'start', roleId: mainRole.id, sessionId });

      try {
        // The main thread's conversation. Each turn is one /v1/messages
        // call; we keep going until the model returns a turn with no
        // tool_use or we hit MAX_TURNS.
        const messages: Array<{
          role: 'user' | 'assistant';
          content: unknown;
        }> = [{ role: 'user', content: message }];

        let finalText = '';

        for (let turn = 0; turn < MAX_TURNS; turn++) {
          if (timedOut) break;

          const tTurn = Date.now();
          const response = await callUpstream({
            system: mainSystemPrompt,
            messages,
            tools: [TASK_TOOL],
            maxTokens: 4096,
          });

          // Forward text deltas to the client and accumulate the final
          // text. We emit one delta per text block, which is coarser
          // than the SDK's token-level streaming but still gives the
          // user immediate feedback.
          const toolUses: Array<{ id: string; name: string; input: any }> = [];
          let turnText = '';
          for (const block of response.content) {
            if (block.type === 'text') {
              turnText += block.text;
              send({ type: 'delta', text: block.text });
            } else if (block.type === 'tool_use') {
              toolUses.push({ id: block.id, name: block.name, input: block.input });
            }
          }
          finalText = turnText;

          if (toolUses.length === 0) {
            // No more work — emit a `message` event and break.
            send({
              type: 'message',
              content: turnText,
              sessionId: undefined,
            });
            break;
          }

          // Append the assistant turn verbatim so the model can see its
          // own tool_use blocks on the next call.
          messages.push({ role: 'assistant', content: response.content });

          // Dispatch each Task tool_use, in order. The model is told to
          // emit one at a time but we handle the general case.
          const toolResults: Array<{
            type: 'tool_result';
            tool_use_id: string;
            content: string;
            is_error?: boolean;
          }> = [];
          for (const tu of toolUses) {
            if (tu.name !== 'Task') {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: `Unknown tool: ${tu.name}`,
                is_error: true,
              });
              continue;
            }
            const subId = String(tu.input?.subagent_type ?? '').trim();
            const subPrompt = String(tu.input?.prompt ?? '').trim();
            if (!subId || !subPrompt) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: 'Task tool_use missing subagent_type or prompt',
                is_error: true,
              });
              continue;
            }
            if (!subagentIds.has(subId)) {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: `Unknown subagent_type: ${subId}. Available: ${[...subagentIds].join(', ')}`,
                is_error: true,
              });
              continue;
            }

            const subStart = Date.now() - startedAt;
            send({
              type: 'hotload',
              subagentId: subId,
              prompt: preview(subPrompt, 400),
              startedAt: subStart,
            });

            try {
              const subText = await dispatchSubagent(
                internalBase,
                subId,
                subPrompt,
                ac.signal,
              );
              send({
                type: 'hotload_done',
                subagentId: subId,
                resultPreview: preview(subText, 240),
                durationMs: Date.now() - startedAt - subStart,
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: subText,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : 'subagent failed';
              send({
                type: 'hotload_done',
                subagentId: subId,
                resultPreview: preview(msg, 240),
                durationMs: Date.now() - startedAt - subStart,
              });
              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: `Subagent ${subId} failed: ${msg}`,
                is_error: true,
              });
            }
          }

          // Feed the results back as a user turn (Anthropic's wire
          // format requires tool_result to be inside a user message).
          messages.push({ role: 'user', content: toolResults });
          console.log(
            `[chat] turn ${turn} done (${Date.now() - tTurn}ms): ${toolUses.length} task(s) dispatched`,
          );
        }

        if (timedOut) {
          send({
            type: 'error',
            message: 'stream timed out before the model produced a final answer',
          });
        }
        // Reference finalText so the value is "used" — the message
        // event already carried it but we keep the variable in case a
        // future field needs it.
        void finalText;
        send({
          type: 'done',
          sessionId,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        send({ type: 'error', message: msg });
        send({
          type: 'done',
          sessionId,
          durationMs: Date.now() - startedAt,
        });
      } finally {
        clearTimeout(hardTimer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

// Suppress unused warning for MAX_TASK_DEPTH — kept as documentation of
// the cap we enforce semantically (the SDK used to cap here).
void MAX_TASK_DEPTH;
