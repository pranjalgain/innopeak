import { NextRequest } from "next/server";

import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

interface PostHogCookieData {
  distinct_id: string;
  [key: string]: unknown;
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
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { captureServerException } = await import("@/app/_libs/utils/posthog-server");

    let distinctId: string | null = null;
    const cookieString = request?.headers instanceof Headers ? request.headers.get("cookie") : null;
    if (cookieString) {
      const postHogCookieMatch = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/);

      if (postHogCookieMatch && postHogCookieMatch[1]) {
        try {
          const decodedCookie = decodeURIComponent(postHogCookieMatch[1]);
          const postHogData = JSON.parse(decodedCookie) as PostHogCookieData;
          distinctId = postHogData.distinct_id;
        } catch (e) {
          console.error("Error parsing PostHog cookie:", e);
        }
      }
    }

    await captureServerException(error, distinctId || undefined);
  }

  // Convert request to RequestInfo format expected by Sentry
  const requestInfo = {
    path: request instanceof NextRequest ? request.nextUrl.pathname : new URL(request.url).pathname,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
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
