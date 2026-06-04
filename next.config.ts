import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /api/chat route reads `plugins/<id>/agents/<id>.md` at runtime via
  // fs.readFile (Function-side plugin prompt loading), and also bundles
  // `src/sandbox/{run-query.mjs,package.json}` for copy-into-sandbox.
  // Next.js output file tracing cannot follow those dynamic fs calls, so
  // we explicitly include both directories in the function bundle.
  outputFileTracingIncludes: {
    "/api/chat": [
      "./plugins/**/*",
      "./src/sandbox/**/*",
    ],
  },
};

export default nextConfig;
