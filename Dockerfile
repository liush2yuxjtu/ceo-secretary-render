# Next.js 16 production image for Render free tier.
# Per node_modules/next/dist/docs/01-app/02-guides/self-hosting.md, `next
# start` is the supported self-host entrypoint. We do NOT use
# `output: 'standalone'` because the v3 app reads plugin markdown files at
# runtime via fs.readFile and `outputFileTracingIncludes` in next.config.ts
# relies on the full build to make those paths available.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=10000 \
    HOSTNAME=0.0.0.0
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/plugins ./plugins
COPY --from=builder /app/src ./src
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
EXPOSE 10000
CMD ["npx", "next", "start", "-p", "10000", "-H", "0.0.0.0"]
