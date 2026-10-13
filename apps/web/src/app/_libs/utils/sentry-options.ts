import type { ErrorEvent, Event } from "@sentry/nextjs";

/**
 * Headers worth reporting with an error. An allow-list on purpose: the request that crashed carries the session cookies and the
 * `Authorization` header, which must never leave this deployment, and a deny-list misses the next header someone adds.
 */
const SAFE_REQUEST_HEADERS = ["user-agent", "accept-language", "referer", "content-type", "x-request-id"] as const;

/** The subset of a request's headers that is safe to attach to an error report. */
export function safeRequestHeaders(headers: Headers): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const name of SAFE_REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value !== null) safe[name] = value;
  }
  return safe;
}

/**
 * Last line of defence on every event: whatever the SDK or an integration collected, no cookies, credentials or personal
 * identifiers leave. `sendDefaultPii` is off, so these are normally absent; this makes that a guarantee instead of a default.
 */
export function scrubEvent<T extends ErrorEvent | Event>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    if (event.request.headers) {
      for (const name of Object.keys(event.request.headers)) {
        if (!SAFE_REQUEST_HEADERS.includes(name.toLowerCase() as (typeof SAFE_REQUEST_HEADERS)[number])) {
          delete event.request.headers[name];
        }
      }
    }
    // A query string can carry a search term (a reviewer's name) or a return path.
    if (event.request.query_string) delete event.request.query_string;
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
    delete event.user.username;
  }
  return event;
}

/**
 * Shared by the browser, server and edge runtimes. Returns `null` when no DSN is configured, so Sentry is simply off (as it is
 * locally) rather than reporting to whatever account a copied config once pointed at.
 */
export function sentryOptions(dsn: string | undefined, tracesSampleRate = 0) {
  if (!dsn) return null;
  return {
    dsn,
    sendDefaultPii: false,
    tracesSampleRate,
    enableLogs: false,
    debug: false,
    beforeSend: scrubEvent,
  };
}
