import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/app/_libs/utils/sentry-options";
import { env } from "env";


/**
 * Error reporting. Off unless NEXT_PUBLIC_SENTRY_DSN is set, and PII-free (no default PII, no replay, scrubbed events). It is the only
 * third-party service the app talks to from the browser; there is no analytics or tag manager.
 */
if (env.NEXT_PUBLIC_APP_ENV !== "development") {
  const options = sentryOptions(env.NEXT_PUBLIC_SENTRY_DSN);
  if (options) Sentry.init(options);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
