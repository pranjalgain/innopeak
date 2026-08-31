import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    ANALYZE: z.enum(["true", "false"]).default("false"),
    // Analytics keys - optional for development, required for production
    POSTHOG_API_KEY: z.string().min(51, "PostHog personal API key is required").optional(),
    POSTHOG_ENV_ID: z.string().min(5, "PostHog environment ID is required").optional(),
    SENTRY_AUTH_TOKEN: z.string().min(1, "Sentry auth token is required").optional(),
    // Database configuration
    DB_DIALECT: z.enum(["postgresql", "mysql", "sqlite"]).default("sqlite"),
    DATABASE_URL: z
      .string()
      .min(1, "Database URL is required")
      .default("file:./create-next-coe.db"),
  },
  client: {
    NEXT_PUBLIC_APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
    NEXT_PUBLIC_APP_TITLE: z.string().min(1, "App title is required").default("Create Next CoE"),
    NEXT_PUBLIC_APP_NAME: z.string().min(1, "App name is required").default("Create Next CoE"),
    NEXT_PUBLIC_APP_URL: z.url("App URL is required").default("http://localhost:3000"),
    NEXT_PUBLIC_APP_DESCRIPTION: z
      .string()
      .min(1, "App description is required")
      .default("Production-ready Next.js starter"),
    NEXT_PUBLIC_APP_CATEGORY: z.string().min(1, "App category is required").default("app"),
    NEXT_PUBLIC_APP_KEYWORDS: z
      .string()
      .min(1, "App keywords are required")
      .default("nextjs,starter,boilerplate"),
    // Analytics - optional for development
    NEXT_PUBLIC_GTM_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(47, "PostHog key is required").optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z
      .url("PostHog host URL is required")
      .default("https://eu.i.posthog.com"),
    NEXT_PUBLIC_POSTHOG_INGEST: z.string().default("/ingest"),
    NEXT_PUBLIC_POSTHOG_ENVIRONMENT: z
      .enum(["development", "staging", "production"])
      .default("development"),
  },
  runtimeEnv: {
    // Private
    NODE_ENV: process.env.NODE_ENV,
    ANALYZE: process.env.ANALYZE,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
    POSTHOG_ENV_ID: process.env.POSTHOG_ENV_ID,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    DB_DIALECT: process.env.DB_DIALECT,
    DATABASE_URL: process.env.DATABASE_URL,
    // Public
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_APP_TITLE: process.env.NEXT_PUBLIC_APP_TITLE,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_DESCRIPTION: process.env.NEXT_PUBLIC_APP_DESCRIPTION,
    NEXT_PUBLIC_APP_CATEGORY: process.env.NEXT_PUBLIC_APP_CATEGORY,
    NEXT_PUBLIC_APP_KEYWORDS: process.env.NEXT_PUBLIC_APP_KEYWORDS,
    NEXT_PUBLIC_GTM_KEY: process.env.NEXT_PUBLIC_GTM_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_INGEST: process.env.NEXT_PUBLIC_POSTHOG_INGEST,
    NEXT_PUBLIC_POSTHOG_ENVIRONMENT: process.env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT,
  },
});
