# CEO Secretary on Render (production fallback)

Deploys the v3 Next.js 16 app to Render free tier. The v3 app uses direct
`fetch('/v1/messages')` (no Claude Code SDK), so the deployment should
work on any Docker host that fits the build.

## What is included

- `Dockerfile` — three-stage: `deps` (npm ci) → `builder` (next build) →
  `runner` (next start on :10000).
- `render.yaml` — Render Blueprint with `free` plan (512 MB RAM).

## What is NOT included (you must add)

- `src/` `public/` `plugins/` `next.config.ts` etc. are NOT in this dir.
  The Dockerfile uses `COPY . .` so you must populate this dir from the
  worktree root before pushing. See the deploy script.
- `.gitignore` to keep `.next/`, `node_modules/`, `experiments/` out of
  the deploy commit.
- Env vars: `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`,
  `ANTHROPIC_MODEL` — set these in the Render dashboard or via the API.

## Why this might fail

1. **`@vercel/sandbox`** is in `package.json` but is a Vercel-only
   product. `npm install` will succeed but the subagent exec path
   (the `Task` tool dispatch in `/api/chat`) will throw at runtime
   when it tries to call `Sandbox.create()`. The main CEO secretary
   synthesis should still work because it goes through direct fetch.
2. **`outputFileTracingIncludes`** in `next.config.ts` is a Vercel
   optimization. It is ignored by `next build` on non-Vercel hosts.
3. **Free plan 512 MB RAM** may be tight for the Next.js runtime. If
   the service OOMs, upgrade to Render's Starter plan ($7/month, 512 MB
   but no sleep) or use Fly.io or HF Spaces.
