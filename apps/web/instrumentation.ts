import * as Sentry from "@sentry/nextjs";
import { NextRequest } from "next/server";

import { EventEmitter } from "node:events";

import { safeRequestHeaders } from "@/app/_libs/utils/sentry-options";

// Sentry's Node auto-instrumentation adds its own `close`/`finish` listeners on top of Next's own,
// past the default cap of 10 per `ServerResponse` — a fixed, known interaction with tracesSampleRate: 1
// in dev, not an actual growing leak. Raised once, before Sentry's instrumentation registers anything.
EventEmitter.defaultMaxListeners = 20;

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (
  error: unknown,
  request: NextRequest | Request,
  errorContext: {
    routerKind?: string;
    routePath?: string;
    routeType?: string;
    revalidateReason?: string;
    [key: string]: unknown;
  },
): Promise<void> => {
  // Convert request to RequestInfo format expected by Sentry. Allow-listed headers only: the full set carries the session cookies.
  const requestInfo = {
    path: request instanceof NextRequest ? request.nextUrl.pathname : new URL(request.url).pathname,
    method: request.method,
    headers: safeRequestHeaders(request.headers),
  };

  // Ensure required properties are strings, provide defaults if undefined
  const sentryErrorContext = {
    routerKind: errorContext.routerKind || "",
    routePath: errorContext.routePath || "",
    routeType: errorContext.routeType || "",
    ...(errorContext.revalidateReason && { revalidateReason: errorContext.revalidateReason }),
    // Include any other properties that are defined
    ...Object.fromEntries(
      Object.entries(errorContext).filter(
        ([key, value]) =>
          !["routerKind", "routePath", "routeType", "revalidateReason"].includes(key) &&
          value !== undefined,
      ),
    ),
  };

  Sentry.captureRequestError(error, requestInfo, sentryErrorContext);
};
