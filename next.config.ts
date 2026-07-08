import type { NextConfig } from "next";

// NEXT_OUTPUT=export produces the fully static bundle in out/ that the
// Electron desktop shell serves offline (npm run app:build).
const isStaticExport = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
