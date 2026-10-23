import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    ANALYZE: z.enum(["true", "false"]).default("false"),
    SENTRY_AUTH_TOKEN: z.string().min(1, "Sentry auth token is required").optional(),
    // Sentry organization/project that source maps are uploaded to; set together with SENTRY_AUTH_TOKEN.
    SENTRY_ORG: z.string().min(1).optional(),
    SENTRY_PROJECT: z.string().min(1).optional(),
    // Where the Next server proxies `/v1/*` to. Server-only: it is read by the rewrite in `next.config.ts` and nowhere in the browser, and a
    // `NEXT_PUBLIC_` name inlined an internal backend hostname into every visitor's bundle.
    API_URL: z.url("API URL is required").default("http://localhost:3000"),
  },
  client: {
    NEXT_PUBLIC_APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
    NEXT_PUBLIC_APP_TITLE: z.string().min(1, "App title is required").default("InnoPeak"),
    NEXT_PUBLIC_APP_NAME: z.string().min(1, "App name is required").default("InnoPeak"),
    NEXT_PUBLIC_APP_URL: z.url("App URL is required").default("http://localhost:3000"),
    NEXT_PUBLIC_APP_DESCRIPTION: z
      .string()
      .min(1, "App description is required")
      .default("AI-assisted Google Business Profile review management"),
    NEXT_PUBLIC_APP_CATEGORY: z.string().min(1, "App category is required").default("app"),
    NEXT_PUBLIC_APP_KEYWORDS: z
      .string()
      .min(1, "App keywords are required")
      .default("reviews,google-business-profile,ai-replies"),
    // Optional — only needed for in-app card entry in Settings → Billing (needs the
    // backend's Stripe keys). Safe to expose to the browser, unlike the backend's STRIPE_SECRET_KEY.
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    // Error reporting is off unless this is set; it deliberately has no default.
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  },
  runtimeEnv: {
    // Private
    NODE_ENV: process.env.NODE_ENV,
    ANALYZE: process.env.ANALYZE,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    // The old `NEXT_PUBLIC_API_URL` name still works, so a deployment need not change its settings in the same release.
    API_URL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL,
    // Public
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_APP_TITLE: process.env.NEXT_PUBLIC_APP_TITLE,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_DESCRIPTION: process.env.NEXT_PUBLIC_APP_DESCRIPTION,
    NEXT_PUBLIC_APP_CATEGORY: process.env.NEXT_PUBLIC_APP_CATEGORY,
    NEXT_PUBLIC_APP_KEYWORDS: process.env.NEXT_PUBLIC_APP_KEYWORDS,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
});
