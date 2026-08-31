import { PostHog } from "posthog-node";
import { env } from "env";

let posthogInstance: PostHog | null = null;

export function getPostHogServer() {
  if (!posthogInstance) {
    posthogInstance = new PostHog("phc_4vV3IEEOtQjqPBn4U6n63UF8LsUvC19FLS2ffYMBBIK", {
      host: "https://eu.i.posthog.com",
      flushAt: 1,
      flushInterval: 0, // Because server-side functions in Next.js can be short-lived we flush regularly
    });
  }
  return posthogInstance;
}

export async function captureServerException(error: unknown, distinctId?: string) {
  const client = getPostHogServer();
  client.captureException(error, distinctId || undefined, {
    environment: env.NEXT_PUBLIC_POSTHOG_ENVIRONMENT,
  });
}
