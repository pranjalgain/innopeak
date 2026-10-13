// Server-side Sentry. Off unless NEXT_PUBLIC_SENTRY_DSN is set; options (no PII, header scrubbing) live in `sentry-options`.
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/app/_libs/utils/sentry-options";

const options = sentryOptions(
  process.env.NEXT_PUBLIC_SENTRY_DSN,
  Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
);

if (options) Sentry.init(options);
