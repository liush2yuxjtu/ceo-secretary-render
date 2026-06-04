import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /api/chat and /api/plugin/[id] routes read
  // `plugins/<id>/agents/<id>.md` at runtime via fs.readFile. Next.js
  // output file tracing cannot follow those dynamic fs calls, so we
  // explicitly include the plugins directory in the function bundle.
  outputFileTracingIncludes: {
    "/api/chat": ["./plugins/**/*"],
    "/api/plugin/[id]": ["./plugins/**/*"],
  },
};

export default nextConfig;
