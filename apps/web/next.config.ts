import type { NextConfig } from "next";

import withBundleAnalyzer from "@next/bundle-analyzer";
import { withPostHogConfig } from "@posthog/nextjs-config";
import { withSentryConfig } from "@sentry/nextjs";
import { env } from "env";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// const isDev = env.NODE_ENV !== "production";

const remotePatterns: RemotePattern[] = [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../../"),
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
    root: path.join(__dirname, "../../"),
    resolveAlias: {
      zod: "zod/index.cjs",
    },
  },
  // Security headers for the HTML tier. The backend's helmet only covers the JSON API; the Next
  // app that actually renders pages shipped none. These are the subset that is safe to add without
  // a nonce-based setup — they harden clickjacking, MIME-sniffing, referrer leakage, and feature
  // access without touching how scripts/styles/connections load (so HMR, RSC hydration, and the
  // proxied analytics all keep working). A script-src/connect-src CSP that would also blunt token
  // exfil needs per-request nonces + an analytics allowlist and is a separate, larger change.
  async headers() {
    const securityHeaders = [
      // Clickjacking: this app must never be framed by another origin. `frame-ancestors` is the
      // modern control; `X-Frame-Options` covers older browsers.
      {
        key: "Content-Security-Policy",
        value: [
          "frame-ancestors 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "upgrade-insecure-requests",
        ].join("; "),
      },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      // Ignored by browsers over http (so harmless in local dev); enforced once served over https.
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      // Backend API proxy — every `/v1/*` call is served from this app's own origin and forwarded
      // to the NestJS API. This is what makes the auth cookies first-party: the backend's
      // Set-Cookie comes back through this origin, so `proxy.ts` (edge middleware) and the browser
      // both see the session on `app.example.com` even though the API lives on `api.example.com`.
      // Without it the middleware only works when both happen to share a hostname, i.e. localhost.
      {
        source: "/v1/:path*",
        destination: `${env.NEXT_PUBLIC_API_URL}/v1/:path*`,
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
    optimizePackageImports: ["react-hook-form", "lodash-es", "react-icons", "vaul", "tailwind-merge", "zod"],
    webVitalsAttribution: ["FCP", "LCP", "CLS", "FID", "TTFB", "INP"],
  },
};

const nextConfigWithIntl = withNextIntl(nextConfig);

// Conditionally apply PostHog configuration only if API keys are provided
const withPostHog =
  env.POSTHOG_API_KEY && env.POSTHOG_ENV_ID
    ? withPostHogConfig(nextConfigWithIntl, {
        personalApiKey: env.POSTHOG_API_KEY, // Personal API Key
        envId: env.POSTHOG_ENV_ID, // Environment ID
        host: env.NEXT_PUBLIC_POSTHOG_HOST, // (optional), defaults to https://us.posthog.com
      })
    : nextConfigWithIntl;

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
    : nextConfigWithIntl,
);
