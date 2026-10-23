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
    // A Referer is a full URL of the page the request came from: it carries the same tokens and query strings as `request.url`.
    if (value !== null) safe[name] = name === "referer" ? scrubUrl(value) : value;
  }
  return safe;
}

/** A path segment that is a credential or an id rather than a word: an invite token (43 base64url characters), a Stripe session id, a uuid. */
const OPAQUE_SEGMENT = /^(?=.*\d)[A-Za-z0-9_-]{20,}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REDACTED = "[redacted]";

/**
 * A URL as it may be reported: no query string or fragment (`?session_id=cs_live_…`, a `?next=` return path, a search term) and no opaque
 * path segment (`/accept-invite/<token>`). Works for an absolute URL, a path, or anything else that merely looks like one; an empty value
 * passes through.
 */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  const withoutQuery = cut === -1 ? url : url.slice(0, cut);
  return withoutQuery
    .split("/")
    .map((segment) => (OPAQUE_SEGMENT.test(segment) ? REDACTED : segment))
    .join("/");
}

const BREADCRUMB_URL_KEYS = ["url", "from", "to"] as const;

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
        } else if (name.toLowerCase() === "referer") {
          event.request.headers[name] = scrubUrl(event.request.headers[name] ?? "");
        }
      }
    }
    // A query string can carry a search term (a reviewer's name) or a return path.
    if (event.request.query_string) delete event.request.query_string;
    // The URL itself carries the same: an invite token in the path, `?session_id=` after a checkout.
    if (event.request.url) event.request.url = scrubUrl(event.request.url);
  }
  // A transaction is named after the page, so it carries the URL too.
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  for (const crumb of event.breadcrumbs ?? []) {
    for (const key of BREADCRUMB_URL_KEYS) {
      const value = crumb.data?.[key] as unknown;
      if (crumb.data && typeof value === "string") crumb.data[key] = scrubUrl(value);
    }
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
