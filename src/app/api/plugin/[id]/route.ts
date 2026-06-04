// POST /api/plugin/[id] — run a single plugin's agent via direct fetch.
//
// v4.1 (portable orchestrator): replaces the Vercel-Sandbox subagent exec.
// The main /api/chat route calls this endpoint with a (pluginId, message)
// pair whenever the model emits a `Task` tool_use. Each plugin is its
// own one-shot /v1/messages call, so the call surface is identical to
// what the SDK used to do inside the Vercel Sandbox — but with no
// sandbox, no OIDC, no host lock-in.
//
// Request body:  { message: string, sessionId?: string }
// Response body: { text: string, usage?: object, model?: string }

import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import { resolveRolePaths } from '@/lib/roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds

// Strip YAML frontmatter from agent markdown prompts.
function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return new Response('Missing message', { status: 400 });
  const pluginId = params.id;

  // Resolve the plugin's on-disk path.
  const all = await resolveRolePaths();
  const role = all.find((r) => r.id === pluginId);
  if (!role) {
    return new Response(`Plugin not found: ${pluginId}`, { status: 404 });
  }
  if (!role.pluginPath) {
    return new Response(`Plugin not installed: ${pluginId}`, { status: 424 });
  }

  // Load the plugin's system prompt.
  const promptFile = `${role.pluginPath}/agents/${role.agentName}.md`;
  let systemPrompt: string;
  try {
    const raw = await fs.readFile(promptFile, 'utf8');
    systemPrompt = stripFrontmatter(raw);
  } catch (e) {
    return new Response(
      `Cannot read agent prompt for ${pluginId}: ${(e as Error).message}`,
      { status: 500 },
    );
  }

  // Forward the same env we use everywhere else.
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const token =
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  const model = process.env.ANTHROPIC_MODEL || 'MiniMax-M3';
  if (!baseUrl || !token) {
    return new Response(
      `Missing ANTHROPIC_BASE_URL or ANTHROPIC_API_KEY in container env`,
      { status: 500 },
    );
  }

  const t0 = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: message }],
      }),
    });
  } catch (e) {
    return new Response(
      `Upstream fetch failed: ${(e as Error).message}`,
      { status: 502 },
    );
  }

  const text = await upstream.text();
  const durationMs = Date.now() - t0;

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({
        error: 'upstream_non_2xx',
        status: upstream.status,
        durationMs,
        body: text.slice(0, 1000),
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  let parsed: {
    content?: Array<{ type: string; text?: string }>;
    usage?: unknown;
    model?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(
      `Upstream returned non-JSON (${upstream.status}): ${text.slice(0, 500)}`,
      { status: 502 },
    );
  }

  const out = (parsed.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');

  return Response.json({
    text: out,
    usage: parsed.usage,
    model: parsed.model,
    durationMs,
  });
}
