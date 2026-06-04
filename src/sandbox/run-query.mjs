#!/usr/bin/env node
// run-query.mjs — runs inside Vercel Sandbox.
//
// Receives a request JSON file path as argv[2] (or via $REQUEST_FILE), reads
// it, runs `claude -p --output-format stream-json --verbose` with the
// forwarded env, and streams its stdout (one JSON object per line) to our
// own stdout. The Vercel Function reads our stdout in one block via
// `command.stdout()` and forwards each line as a `ChatStreamEvent` SSE.
//
// Bootstrap: if `claude` is not on PATH, run `npm install -g
// @anthropic-ai/claude-code` (one-time, ~30s, idempotent across
// snapshot resumes).

import { readFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const REQUEST_FILE = process.argv[2] || process.env.REQUEST_FILE;
if (!REQUEST_FILE) {
  console.error('FATAL: no request file');
  process.exit(2);
}

const HERE = dirname(new URL(import.meta.url).pathname);
const LOG_FILE = `${HERE}/last-run.log`;

async function log(line) {
  try { await appendFile(LOG_FILE, line + '\n'); } catch {}
}

await log(`[run-query] starting at ${new Date().toISOString()}`);

// Source .env.runtime into process.env before any spawn.
const envFile = `${HERE}/.env.runtime`;
if (existsSync(envFile)) {
  const envText = await readFile(envFile, 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

let request;
try {
  const raw = await readFile(REQUEST_FILE, 'utf8');
  request = JSON.parse(raw);
} catch (e) {
  console.error(`FATAL: cannot read request: ${e.message}`);
  process.exit(4);
}

const { prompt, sessionId, env, model } = request;
if (typeof prompt !== 'string' || !prompt) {
  console.error('FATAL: request.prompt must be non-empty string');
  process.exit(5);
}

// One-time install of the Claude Code CLI. Cheap when already installed
// (returns <500ms with "up to date"). With sudo for global install.
const which = spawnSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' });
if (which.status !== 0) {
  await log('[run-query] installing @anthropic-ai/claude-code globally (~30s)…');
  const install = spawnSync(
    'sudo',
    ['npm', 'install', '-g', '@anthropic-ai/claude-code', '--no-audit', '--no-fund', '--loglevel=error'],
    { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, npm_config_progress: 'false' } },
  );
  if (install.status !== 0) {
    const msg = `npm install -g failed (exit ${install.status})`;
    await log(`[run-query] ${msg}`);
    console.error(msg);
    process.exit(6);
  }
  await log('[run-query] install complete');
} else {
  await log(`[run-query] claude already installed at ${which.stdout.trim()}`);
}

const args = [
  '-p', prompt,
  '--output-format', 'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  '--model', model || process.env.ANTHROPIC_MODEL || 'claude-opus-4-6',
];
if (sessionId) {
  args.push('--resume', sessionId);
}

const childEnv = { ...process.env, ...(env || {}) };
await log(`[run-query] ANTHROPIC_API_KEY=${childEnv.ANTHROPIC_API_KEY ? 'set(len=' + childEnv.ANTHROPIC_API_KEY.length + ')' : 'MISSING'} BASE_URL=${childEnv.ANTHROPIC_BASE_URL || 'MISSING'}`);

const child = spawn('claude', args, {
  env: childEnv,
  cwd: HERE,
  stdio: ['ignore', 'pipe', 'pipe'],
});

function tee(stream, label) {
  stream.on('data', (chunk) => {
    const text = chunk.toString();
    log(`[${label}] ${text}`).catch(() => {});
    process.stdout.write(text);
  });
}
tee(child.stdout, 'stdout');
tee(child.stderr, 'stderr');

child.on('exit', (code) => {
  log(`[run-query] exit code=${code}`).catch(() => {});
  process.stdout.write(
    JSON.stringify({ type: '_sandbox_done', exitCode: code }) + '\n',
  );
  process.exit(code ?? 0);
});
child.on('error', (err) => {
  log(`[run-query] error: ${err.message}`).catch(() => {});
  process.stdout.write(
    JSON.stringify({ type: '_sandbox_error', message: err.message }) + '\n',
  );
  process.exit(1);
});
