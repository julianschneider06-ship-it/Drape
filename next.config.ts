import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the catalogue snapshot written by scripts/fetch-snapshot.mjs (prebuild) travels with the functions that compose pages
  outputFileTracingIncludes: { "/api/**": ["./src/generated/**"], "/taste": ["./src/generated/**"] },
};

export default nextConfig;
