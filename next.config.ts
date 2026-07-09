import type { NextConfig } from "next";

// NEXT_OUTPUT=export produces the fully static bundle in out/ that the
// Electron desktop shell serves offline (npm run app:build).
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  // TypeScript 7 (the native compiler) has no JS API for Next's embedded
  // type-check build phase, so the build scripts run `tsc --noEmit` first
  // (npm run typecheck) and this skips Next's own pass.
  typescript: { ignoreBuildErrors: true },
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
