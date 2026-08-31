import * as Sentry from "@sentry/nextjs";
import { env } from "env";
import posthog from "posthog-js";

/**
 * @description Initialize Sentry outside local development.
 *
 * The upload token is server-only and must never be read by the browser bundle.
 */
if (env.NEXT_PUBLIC_APP_ENV !== "development") {
  Sentry.init({
    dsn: "https://fd0bd6638651a9975e3b7809d12f5565@o1428761.ingest.us.sentry.io/4509809603772416",

    sendDefaultPii: true,

    // Add optional integrations for additional features
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],

    // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
    tracesSampleRate: 1,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Define how likely Replay events are sampled.
    // This sets the sample rate to be 10%. You may want this to be 100% while
    // in development and sample at a lower rate in production
    replaysSessionSampleRate: 0.1,

    // Define how likely Replay events are sampled when an error occurs.
    replaysOnErrorSampleRate: 1.0,

    // Setting this option to true will print useful information to the console while you're setting up Sentry.
    debug: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

/**
 * @description Initialize PostHog (only if API key is available)
 */
if (env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: env.NEXT_PUBLIC_POSTHOG_INGEST,
    ui_host: env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: "2025-05-24",
    capture_dead_clicks: true,
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    capture_exceptions: true,
    capture_heatmaps: true,
    capture_performance: true,
    // debug: env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT === "development",
  });
}
