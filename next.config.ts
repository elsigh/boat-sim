import type { NextConfig } from "next";

// NEXT_OUTPUT=export produces the fully static bundle in out/ that the
// Electron desktop shell serves offline (npm run app:build).
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "1" : "0" },
  // StrictMode's dev-only double mount makes @react-three/rapier's suspended
  // WASM init tear down the WebGL context (react-three-fiber force-loses it on
  // unmount, and the same canvas element can never get a live context back).
  // The sim renders one Canvas for the whole session; StrictMode costs more
  // than it catches here.
  reactStrictMode: false,
  // Next 16.3 preview can run TypeScript 7's native CLI directly instead of
  // requiring the legacy JavaScript compiler API.
  experimental: {
    useTypeScriptCli: true,
  },
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
