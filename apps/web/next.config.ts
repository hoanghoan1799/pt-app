import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  env: {
    // Versions the service worker URL so each deploy reinstalls it.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
  reactCompiler: true,
  // The e2e dev server uses the native React Compiler: the Babel one runs in a
  // Node loader pool whose process spawn fails on Windows (exit 0xc0000142)
  // when the big chat page compiles. Off everywhere else.
  experimental:
    process.env.E2E_RUST_REACT_COMPILER === "1"
      ? { turbopackRustReactCompiler: true }
      : {},
  images: {
    // The e2e server serves thumbnails straight from the browser, where the
    // specs abort ytimg requests; the optimizer would fetch the fake seed IDs
    // server-side, past page.route, and log a 404 for each one.
    unoptimized: process.env.E2E_UNOPTIMIZED_IMAGES === "1",
    // YouTube video thumbnails.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" },
    ],
  },
  async headers() {
    return [
      {
        // Every deploy must reach installed apps; the worker is never cached.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
