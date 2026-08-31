import type { NextConfig } from "next";

import withBundleAnalyzer from "@next/bundle-analyzer";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "env";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import path from "node:path";

// const isDev = env.NODE_ENV !== "production";

const remotePatterns: RemotePattern[] = [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "./"),
  poweredByHeader: false,
  productionBrowserSourceMaps: true, // sentry and posthog config
  skipTrailingSlashRedirect: true,
  typedRoutes: true,
  serverExternalPackages: ["import-in-the-middle", "require-in-the-middle"], // posthog config
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns,
  },
  // Force Turbopack to resolve Zod via CJS to avoid ESM module splitting
  // that causes "_check is not defined" errors (https://github.com/colinhacks/zod/issues/5469)
  turbopack: {
    resolveAlias: {
      zod: "zod/index.cjs",
    },
  },
  async rewrites() {
    return [
      // Homepage rewrite
      {
        source: "/",
        destination: "/home",
      },
      // Google Tag Manager Proxy
      {
        source: "/gm",
        destination: "https://www.googletagmanager.com/gtm.js",
      },
      {
        source: "/gtm/td",
        destination: "https://www.googletagmanager.com/td",
      },
      {
        source: "/debug/bootstrap",
        destination: "https://www.googletagmanager.com/debug/bootstrap",
      },
      {
        source: "/debug/:path*",
        destination: "https://www.googletagmanager.com/debug/:path*",
      },
      {
        source: "/controller.js",
        destination: "https://www.googletagmanager.com/controller.js",
      },
      {
        source: "/gtm/:path*",
        destination: "https://www.googletagmanager.com/gtm/:path*",
      },
      // PostHog Proxy
      {
        source: "/ingest/static/:path*",
        destination: "https://eu-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://eu.i.posthog.com/:path*",
      },
      {
        source: "/ingest/flags",
        destination: "https://eu.i.posthog.com/flags",
      },
    ];
  },
  experimental: {
    authInterrupts: true,
    inlineCss: true,
    optimizePackageImports: [
      "date-fns",
      "react-hook-form",
      "lodash-es",
      "react-icons",
      "recharts",
      "react-day-picker",
      "react-resizable-panels",
      "vaul",
      "tailwind-merge",
      "zod",
      "embla-carousel-react",
      "input-otp",
      "cmdk",
    ],
    webVitalsAttribution: ["FCP", "LCP", "CLS", "FID", "TTFB", "INP"],
  },
};

// Conditionally apply PostHog configuration only if API keys are provided
const withPostHog =
  env.POSTHOG_API_KEY && env.POSTHOG_ENV_ID
    ? withPostHogConfig(nextConfig, {
        personalApiKey: env.POSTHOG_API_KEY, // Personal API Key
        envId: env.POSTHOG_ENV_ID, // Environment ID
        host: env.NEXT_PUBLIC_POSTHOG_HOST, // (optional), defaults to https://us.posthog.com
      })
    : nextConfig;

// Conditionally apply Sentry configuration only if auth token is provided
const withSentry = env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(withPostHog, {
      org: "test-organisation-qk",
      project: "create-next-coe",
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring", // ?!monitoring in next.config.ts when using middleware.ts file
      disableLogger: true,
      automaticVercelMonitors: true,
      authToken: env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        deleteSourcemapsAfterUpload: false,
      },
      reactComponentAnnotation: {
        enabled: true,
      },
    })
  : withPostHog;

export default withBundleAnalyzer({
  enabled: env.ANALYZE === "true",
})(
  env.NEXT_PUBLIC_APP_ENV === "production" || env.NEXT_PUBLIC_APP_ENV === "staging"
    ? withSentry
    : nextConfig,
);
