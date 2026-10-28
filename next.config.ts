import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Pin the workspace root to this app. Without it Next infers the root from
  // lockfiles it finds nearby, which in a build container can point above the
  // app and make Turbopack crawl an unrelated tree (a build that looks stuck).
  turbopack: {
    root: process.cwd(),
  },
  // The preview is served from a public host that differs from the in-container
  // dev origin, so Next 16 blocks cross-origin /_next and HMR without this.
  allowedDevOrigins: [
    "*.iqx.dev",
    ...(process.env.IQX_PROJECT_ID || process.env.PROJECT_ID
      ? [
          `https://preview-${process.env.IQX_PROJECT_ID || process.env.PROJECT_ID}-web.iqx.dev`,
          `preview-${process.env.IQX_PROJECT_ID || process.env.PROJECT_ID}-mobile.iqx.dev`,
        ]
      : []),
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
  },
};

export default nextConfig;
