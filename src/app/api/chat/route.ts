// POST /api/chat — stream a chat completion from CEO秘书.
//
// v4.0.0 (Vercel Sandbox orchestrator): the Anthropic Agent SDK cannot run
// inside a Vercel Function — at every version (0.2.109 pure-JS, 0.3.x with
// a 244 MB Bun binary) the SDK's `query()` loop silently produces zero
// output and the function returns 200 + empty body. See
// docs/adr/0003-v3-direct-fetch.md §"Tested counter-hypothesis".
//
// Vercel Sandbox (https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk)
// is the documented escape hatch: a real Linux microVM in iad1 with no
// 250 MB bundle cap, no Firecracker seccomp restrictions, and 5-hour
// timeouts. We:
//   1. read the plugin prompts in the Function (fs.readFile on plugins/,
//      which is traced into the bundle via outputFileTracingIncludes)
//   2. ship those prompts + the user's message to a *persistent* Vercel
//      Sandbox (one named `ceo-secretary` per project, resumed from
//      snapshot after first install)
//   3. run a small Node script inside the sandbox that calls the SDK's
//      `query()` and prints each event as one JSON line on stdout
//   4. forward those JSONL lines to the client as `ChatStreamEvent` SSE
//
// The sandbox installs the SDK on first call (one-time, ~20 s) and
// resumes from snapshot on every subsequent call (~1 s). On Pro this
// costs ~$0.01-0.05 per chat session.

import { NextRequest } from 'next/server';
import { Sandbox } from '@vercel/sandbox';
import { randomUUID } from 'node:crypto';
import {
  MAIN_ROLE_ID,
  getMainRole,
  resolveRolePaths,
  type Role,
} from '@/lib/roles';
import type { ChatStreamEvent } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // seconds (matches Vercel Sandbox Pro max of 5h)

// One persistent sandbox per project. The SDK install + node_modules live
// in this sandbox's filesystem snapshot, so we pay the install cost once
// and every subsequent chat resumes from the cached snapshot.
const SANDBOX_NAME = 'ceo-secretary-default';

// Where inside the sandbox the script and request live. We copy the
// sources from the Function bundle into the sandbox on first call; on
// subsequent calls the snapshot already has them.
const SANDBOX_HERE = '/vercel/sandbox/ceo-secretary';
const SANDBOX_REQUEST_FILE = `${SANDBOX_HERE}/request.json`;
const SANDBOX_SCRIPT = `${SANDBOX_HERE}/run-query.mjs`;
const SANDBOX_PACKAGE_JSON = `${SANDBOX_HERE}/package.json`;

// Hard ceiling on the streaming wall clock. The SDK + provider can
// sometimes hang after a subagent turn. Mirrors the v0.2.0 hard timeout.
const HARD_TIMEOUT_MS = 120_000;

// Sandbox-level timeout (default 5m, can extend to 5h on Pro).
const SANDBOX_TIMEOUT_MS = 5 * 60 * 1000;

// ── SSE helpers (route → client) ──────────────────────────────────────────
function sse(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function preview(text: string, max = 200): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

// ── Plugin prompt loading (Function-side) ────────────────────────────────
async function loadAgentPrompt(pluginPath: string, agentName: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const file = `${pluginPath}/agents/${agentName}.md`;
  const raw = await readFile(file, 'utf8');
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

// ── Sandbox bootstrap: install the Claude Code CLI once ─────────────────
async function ensureSandboxReady(sandbox: Sandbox): Promise<void> {
  // Always write the latest source files (cheap; lets us update the script
  // and package.json without re-snapshotting).
  const { readFile } = await import('node:fs/promises');
  const [pkg, script] = await Promise.all([
    readFile(`${process.cwd()}/src/sandbox/package.json`, 'utf8'),
    readFile(`${process.cwd()}/src/sandbox/run-query.mjs`, 'utf8'),
  ]);
  await sandbox.writeFiles([
    { path: SANDBOX_PACKAGE_JSON, content: Buffer.from(pkg) },
    { path: SANDBOX_SCRIPT, content: Buffer.from(script) },
  ]);

  // Probe: is the `claude` CLI on PATH yet?
  const probe = await sandbox
    .runCommand({
      cmd: 'sh',
      args: ['-c', 'command -v claude >/dev/null 2>&1'],
    })
    .catch(() => null);
  if (probe && probe.exitCode === 0) {
    return; // CLI is already installed in the snapshot
  }

  // First-time install: Claude Code CLI (which ships the `claude` binary
  // plus its companion Node.js daemon). npm install -g requires root,
  // which Vercel Sandbox gives us via `sudo: true`.
  console.log('[chat] sandbox: first-time Claude Code CLI install (~30s)…');
  const install = await sandbox.runCommand({
    cmd: 'npm',
    args: ['install', '-g', '@anthropic-ai/claude-code', '--no-audit', '--no-fund', '--loglevel=error'],
    sudo: true,
  });
  if (install.exitCode !== 0) {
    const err = (await install.stderr().catch(() => '')) || '';
    throw new Error(
      `sandbox npm install -g claude-code failed (exit ${install.exitCode}): ${err.slice(0, 500)}`,
    );
  }
  console.log('[chat] sandbox: Claude Code CLI installed');
}

// ── Build the SDK options the same way v0.2.0 did, but inlined ───────────
async function buildSdkOptions() {
  const all = await resolveRolePaths();
  const main = all.find((r) => r.id === MAIN_ROLE_ID);
  if (!main || !main.pluginPath) {
    return { error: 'main role plugin not installed' as const };
  }
  const subagents: Role[] = all.filter(
    (r) => r.id !== MAIN_ROLE_ID && r.pluginPath,
  );

  // Pre-load every subagent's agent prompt here (in the Function) so the
  // sandbox never needs to read files — it just gets a self-contained
  // JSON payload.
  const agents: Record<string, { description: string; prompt: string }> = {};
  for (const s of subagents) {
    if (!s.pluginPath) continue;
    const safeKey = s.id.replace(/[^a-zA-Z0-9_-]/g, '-');
    let prompt: string;
    try {
      prompt = await loadAgentPrompt(s.pluginPath, s.agentName);
    } catch (e) {
      // Skip agents whose prompts are missing — the role catalog might
      // list a role whose plugin isn't fully populated.
      continue;
    }
    agents[safeKey] = {
      description: `${s.english} — ${s.tagline}`,
      prompt,
    };
  }

  // CEO秘书 main persona (also pre-loaded).
  let ceoSecretaryPrompt: string;
  try {
    ceoSecretaryPrompt = await loadAgentPrompt(main.pluginPath, main.agentName);
  } catch (e) {
    return { error: `cannot read main agent prompt: ${(e as Error).message}` as const };
  }

  return {
    options: {
      model: process.env.ANTHROPIC_MODEL ?? 'MiniMax-M3',
      plugins: [{ type: 'local' as const, path: main.pluginPath! }],
      agent: main.agentName,
      permissionMode: 'bypassPermissions' as const,
      includePartialMessages: true,
      maxTurns: 6,
      agents,
      systemPrompt: {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append: ceoSecretaryPrompt,
      },
      settingSources: ['project'] as const,
      env: { ...process.env },
    },
  };
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

  const startedAt = Date.now();
  const sessionId = body.sessionId;

  // Build the SDK options + write the request payload inside the sandbox.
  const built = await buildSdkOptions();
  if ('error' in built) {
    return new Response(built.error, { status: 424 });
  }

  // Debug: log function env at the top of the handler.
  const fnEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => k.startsWith('ANTHROPIC_')),
  );
  console.log(`[chat] function env keys: ${Object.keys(fnEnv).join(',')}`);
  for (const [k, v] of Object.entries(fnEnv)) {
    console.log(`[chat] fn env: ${k}=${String(v).slice(0, 12)}…(len=${String(v).length})`);
  }

  // Collect the env vars the SDK needs. We pass them inside the
  // request JSON (rather than via runCommand.env) because the @vercel/
  // sandbox SDK does not always forward env to the spawned child
  // process tree, and the SDK then spawns its own child (cli.js).
  // Putting the values in the request file guarantees they reach
  // the SDK's options.env regardless of process env propagation.
  const forwardedEnv: Record<string, string> = {};
  for (const k of [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_MODEL',
    'ANTHROPIC_VERSION',
    'ANTHROPIC_DEFAULT_OPUS_MODEL',
    'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  ]) {
    const v = process.env[k];
    if (typeof v === 'string' && v.length > 0) forwardedEnv[k] = v;
  }

  const requestId = randomUUID();
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

      const mainRole = getMainRole();
      send({ type: 'start', roleId: mainRole.id, sessionId });

      // Hard timeout safety net.
      const ac = new AbortController();
      let timedOut = false;
      const hardTimer = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, HARD_TIMEOUT_MS);

      let sandbox: Sandbox | null = null;
      let command: import('@vercel/sandbox').CommandFinished | null = null;
      try {
        console.log('[chat] step 1: get-or-create sandbox');
        const t0 = Date.now();
        // Get-or-create the persistent sandbox. The first create costs
        // ~20s (npm install); every subsequent call resumes from snapshot
        // in ~1s. The OIDC token is read from the VERCEL_OIDC_TOKEN env
        // var that Vercel injects automatically.
        //
        // We tag the sandbox with `project=ceo-secretary` so we can find
        // it again across Function cold starts via Sandbox.list().
        //
        // The v1.10.2 type defs are behind the runtime API: `vcpus` and
        // `tags` are accepted at runtime but missing from the published
        // types. Cast to `any` for the create params; treat the result
        // as a strongly-typed Sandbox.
        console.log('[chat] step 1a: list');
        const list = (await Sandbox.list({})) as unknown as {
          sandboxes: Array<{
            id: string;
            status: string;
            tags?: Record<string, string>;
          }>;
        };
        console.log(`[chat] step 1b: list returned ${list.sandboxes?.length ?? 0} sandboxes (${Date.now() - t0}ms)`);
        const existing = list.sandboxes?.find(
          (s) => s.tags?.project === 'ceo-secretary',
        );
        if (existing && existing.status !== 'stopped' && existing.status !== 'failed') {
          console.log(`[chat] step 1c: get existing ${existing.id}`);
          sandbox = await Sandbox.get({ sandboxId: existing.id });
          console.log(`[chat] step 1d: get done (${Date.now() - t0}ms)`);
        } else {
          console.log('[chat] step 1c: create new (existing: ' + (existing?.status ?? 'none') + ')');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sandbox = await Sandbox.create({
            runtime: 'node22',
            timeout: SANDBOX_TIMEOUT_MS,
            ...({ vcpus: 2, memory: 4096, tags: { project: 'ceo-secretary' } } as any),
          });
          console.log(`[chat] step 1d: create done (${Date.now() - t0}ms)`);
        }
        if (!sandbox) throw new Error('sandbox handle is null after get/create');
        console.log(`[chat] step 1 done (${Date.now() - t0}ms): sandbox ready`);
        const t1 = Date.now();
        await ensureSandboxReady(sandbox);
        console.log(`[chat] step 2 done (${Date.now() - t1}ms): bootstrap done`);

        // Write the request file into the sandbox. We *also* write the
        // env vars to a separate file that the script reads directly —
        // putting them in the JSON options field doesn't always reach
        // the SDK's spawned `cli.js` child process.
        const t2 = Date.now();
        const payload = {
          prompt: message,
          sessionId,
          model: process.env.ANTHROPIC_MODEL ?? 'MiniMax-M3',
          env: forwardedEnv,
          options: built.options,
        };
        await sandbox.writeFiles([
          { path: SANDBOX_REQUEST_FILE, content: Buffer.from(JSON.stringify(payload)) },
          {
            path: `${SANDBOX_HERE}/.env.runtime`,
            content: Buffer.from(
              Object.entries(forwardedEnv)
                .map(([k, v]) => `${k}=${v}`)
                .join('\n'),
            ),
          },
        ]);
        console.log(`[chat] step 3 done (${Date.now() - t2}ms): files written`);

        // Run the script. We use blocking mode (not detached) so the
        // SDK's command.stdout() reader returns the full output after
        // the script exits. The Vercel Sandbox SDK's streaming via
        // command.logs() on detached commands is unreliable in the
        // current version; the blocking path is the documented pattern
        // for SDK consumers who want to read the full result.
        const t3 = Date.now();
        command = await sandbox.runCommand({
          cmd: 'node',
          args: [SANDBOX_SCRIPT, SANDBOX_REQUEST_FILE],
          cwd: SANDBOX_HERE,
          signal: ac.signal,
        });
        console.log(`[chat] step 4 done (${Date.now() - t3}ms): runCommand returned, exitCode=${command?.exitCode}`);

        // Read the full stdout of the script. command.stdout() returns
        // a Promise<string> for blocking commands.
        const t4 = Date.now();
        const fullStdout = (await command.stdout().catch((e: Error) => {
          console.error(`[chat] command.stdout() error: ${e.message}`);
          return '';
        })) || '';
        console.log(`[chat] step 5 done (${Date.now() - t4}ms): read ${fullStdout.length} bytes of stdout`);

        // Process the JSONL output. The script emits one JSON object
        // per line; we forward each as a ChatStreamEvent.
        const taskSubagent = new Map<string, string>();
        const taskStartedAt = new Map<string, number>();
        let collected = '';
        let lastSessionId: string | undefined = sessionId;

        for (const line of fullStdout.split('\n')) {
          if (timedOut) break;
          if (!line.trim()) continue;
          let evt: { type: string; [k: string]: unknown };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.type === '_sandbox_done') break;
          if (evt.type === '_sandbox_error') {
            send({
              type: 'error',
              message: String(evt.message ?? 'unknown sandbox error'),
            });
            break;
          }
          // Session init
          if (evt.type === 'system' && evt.subtype === 'init') {
            const data = evt.data as { session_id?: string } | undefined;
            if (data?.session_id) lastSessionId = data.session_id;
            continue;
          }
          // Subagent start
          if (evt.type === 'system' && evt.subtype === 'task_started') {
            const m = evt as unknown as {
              task_id: string;
              subagent_type?: string;
              description?: string;
              prompt?: string;
            };
            const subagentId = m.subagent_type ?? m.description ?? '';
            const safeKey = subagentId.replace(/[^a-zA-Z0-9_-]/g, '-');
            taskStartedAt.set(m.task_id, Date.now() - startedAt);
            taskSubagent.set(m.task_id, safeKey);
            send({
              type: 'hotload',
              subagentId: safeKey,
              prompt: preview(m.prompt ?? m.description ?? '', 400),
              startedAt: Date.now() - startedAt,
            });
            continue;
          }
          // Subagent done
          if (evt.type === 'system' && evt.subtype === 'task_notification') {
            const m = evt as unknown as {
              task_id: string;
              status: string;
              summary?: string;
              usage?: { duration_ms?: number };
            };
            const roleId = taskSubagent.get(m.task_id);
            if (roleId) {
              const subStart = taskStartedAt.get(m.task_id) ?? Date.now() - startedAt;
              send({
                type: 'hotload_done',
                subagentId: roleId,
                resultPreview: preview(m.summary ?? '', 240),
                durationMs: m.usage?.duration_ms ?? Date.now() - startedAt - subStart,
              });
              taskStartedAt.delete(m.task_id);
              taskSubagent.delete(m.task_id);
            }
            continue;
          }
          // Stream partial tokens
          if (evt.type === 'stream_event') {
            const ev = (
              evt as { event?: { type?: string; delta?: { type?: string; text?: string } } }
            ).event;
            if (
              ev?.type === 'content_block_delta' &&
              ev.delta?.type === 'text_delta' &&
              typeof ev.delta.text === 'string'
            ) {
              collected += ev.delta.text;
              send({ type: 'delta', text: ev.delta.text });
            }
            continue;
          }
          if (evt.type === 'user' || evt.type === 'system') continue;
          // Final assistant message
          if (evt.type === 'assistant') {
            const m = evt as unknown as {
              message?: {
                content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
              };
            };
            const blocks = m.message?.content ?? [];
            const text = blocks
              .filter((b) => b.type === 'text' && typeof b.text === 'string')
              .map((b) => b.text)
              .join('');
            send({ type: 'message', content: text, sessionId: undefined });
            if (text && text.length > collected.length) {
              const tail = text.slice(collected.length);
              collected = text;
              send({ type: 'delta', text: tail });
            }
            continue;
          }
          if (evt.type === 'result') {
            const r = evt as unknown as { session_id?: string };
            if (r.session_id) lastSessionId = r.session_id;
          }
        }

        if (timedOut) {
          send({
            type: 'error',
            message: 'stream timed out before the model produced a final answer',
          });
        }
        // SANITY: dump full state.
        const logFileCmd = await sandbox.runCommand({
          cmd: 'sh',
          args: ['-c', `cat ${SANDBOX_HERE}/.env.runtime 2>&1; echo ---; cat ${SANDBOX_HERE}/last-run.log 2>&1; echo ---; ls -la ${SANDBOX_HERE}/`],
        });
        const debugText = (await logFileCmd.stdout().catch(() => '')) || '';
        const stderr2 = (await command.stderr().catch(() => '')) || '';
        send({
          type: 'message',
          content: `[sanity] exit=${command?.exitCode} stdoutLen=${fullStdout.length} stderrLen=${stderr2.length}\n---debug---\n${debugText.slice(0, 4000)}\n---last-run.log---\n${fullStdout.slice(0, 2000)}`,
        });
        send({
          type: 'done',
          sessionId: lastSessionId,
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
        // Try to stop the running command if the client disconnected.
        // We deliberately do NOT call sandbox.stop() — the sandbox is
        // persistent and may serve other concurrent requests.
        try {
          await command?.kill?.();
        } catch {
          /* already done */
        }
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
