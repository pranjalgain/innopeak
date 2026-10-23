const REDACTED = '[REDACTED]';

/** Path segments whose next segment is a secret (an invite token at `invite/:token`, the web page `accept-invite/:token`), except `accept`, whose token travels in the body. */
const REDACTS_NEXT_PATH_SEGMENT = new Set(['invite', 'accept-invite']);

const NON_SECRET_NEXT_PATH_SEGMENT = 'accept';

/**
 * Drops the query string (logged redacted elsewhere) and redacts invite-token path segments, so secrets in a raw URL (an invite token,
 * Google OAuth `code`/`state`) never reach a log line. Used for the request URL in both the access log and the error log.
 */
export function safeUrl(url: string): string {
  const [pathname = url] = url.split('?', 1);
  const segments = pathname.split('/');

  for (let i = 1; i < segments.length; i++) {
    if (
      REDACTS_NEXT_PATH_SEGMENT.has(segments[i - 1] ?? '') &&
      segments[i] !== NON_SECRET_NEXT_PATH_SEGMENT
    ) {
      segments[i] = REDACTED;
    }
  }

  return segments.join('/');
}

/** A `Referer` is a full URL, usually of a web page (`/accept-invite/<token>`, `/settings?session_id=…`): same treatment as the request URL. */
export function safeReferrer(referrer: string): string {
  try {
    const parsed = new URL(referrer);
    return `${parsed.origin}${safeUrl(parsed.pathname)}`;
  } catch {
    return safeUrl(referrer);
  }
}
