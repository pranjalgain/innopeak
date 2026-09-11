/**
 * Five failure kinds, because the callers branch on exactly these five and nothing finer.
 *
 * The split that matters is Auth vs. everything else: a 401/403 from the provider means the
 * grant is dead and the owner must re-consent (`needs_reauth` + a 409 the UI turns into a
 * "reconnect" button), whereas a 429/5xx means try again later (a 502 the UI turns into
 * "retry"). Collapsing them sends owners through a pointless OAuth round trip during a Google
 * outage, or leaves them staring at a retry button that can never succeed. The fifth,
 * `ProviderNotConfiguredError`, is its own case — not a Google response at all, but this server
 * missing the client id/secret to even start an OAuth round trip.
 */
export abstract class ProviderError extends Error {
  protected constructor(message: string, cause?: unknown) {
    // `{ cause }` rather than a parameter property: Error already declares `cause`, so a property
    // here would shadow it, and passing it through keeps the native cause chain intact.
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
  }
}

/** Provider returned 401/403 — the grant is revoked, expired, or missing a scope. */
export class ProviderAuthError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Provider returned 429, or its own quota error. Retryable, with backoff. */
export class ProviderRateLimitError extends ProviderError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number | null = null,
    cause?: unknown
  ) {
    super(message, cause);
  }
}

/** Provider returned 5xx, or the request never completed. Retryable. */
export class ProviderUnavailableError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * The response arrived and was well-formed HTTP, but did not mean what the mapper needs — an
 * unknown `starRating`, a missing required field. Never retryable: the same request produces the
 * same unmappable response, so retrying only delays the alert.
 */
export class ProviderMappingError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/**
 * The server has no provider credentials configured at all. Distinct from ProviderAuthError,
 * which is about *this tenant's* grant — this one is an operator problem, not an owner problem,
 * and answering 409 "reconnect" for it would send owners round a loop that cannot terminate.
 */
export class ProviderNotConfiguredError extends ProviderError {
  constructor(message: string) {
    super(message);
  }
}
