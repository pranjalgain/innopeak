
import withBundleAnalyzer from "@next/bundle-analyzer";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";
import { env } from "env";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// const isDev = env.NODE_ENV !== "production";

const remotePatterns: RemotePattern[] = [];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  poweredByHeader: false,
  // Source maps are uploaded to Sentry (and removed from the build) by the plugin below; they are never served to the public.
  productionBrowserSourceMaps: false,
  skipTrailingSlashRedirect: true,
  typedRoutes: true,
  serverExternalPackages: ["import-in-the-middle", "require-in-the-middle"], // Sentry's instrumentation
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
  // app that actually renders pages needs its own. These are the static ones: they harden clickjacking,
  // MIME-sniffing, referrer leakage and feature access for every response. The script policy is not here:
  // it needs a fresh nonce per request, so `proxy.ts` builds it (`content-security-policy.ts`), repeats the
  // directives below, and its header is the one a page response carries; anything the proxy skips keeps this one.
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
        destination: `${env.API_URL}/v1/:path*`,
      },
    ];
  },
  experimental: {
    // The notification stream (SSE) goes through the `/v1` rewrite and idles up to 25 s between heartbeats; the 30 s default left too little
    // room for a slow one, and a dropped stream falls back to polling.
    proxyTimeout: 120_000,
    authInterrupts: true,
    inlineCss: true,
    optimizePackageImports: ["react-hook-form", "lodash-es", "react-icons", "tailwind-merge", "zod"],
  },
};

const nextConfigWithIntl = withNextIntl(nextConfig);

// Conditionally apply Sentry configuration only if auth token is provided
const withSentry =
  env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT
    ? withSentryConfig(nextConfigWithIntl, {
        org: env.SENTRY_ORG,
        project: env.SENTRY_PROJECT,
        silent: !process.env.CI,
        widenClientFileUpload: true,
        tunnelRoute: "/monitoring", // ?!monitoring in next.config.ts when using middleware.ts file
        disableLogger: true,
        authToken: env.SENTRY_AUTH_TOKEN,
        sourcemaps: {
          deleteSourcemapsAfterUpload: true,
        },
      })
    : nextConfigWithIntl;

export default withBundleAnalyzer({
  enabled: env.ANALYZE === "true",
})(
  env.NEXT_PUBLIC_APP_ENV === "production" || env.NEXT_PUBLIC_APP_ENV === "staging"
    ? withSentry
    : nextConfigWithIntl,
);
