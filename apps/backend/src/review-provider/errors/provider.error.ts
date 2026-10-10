/**
 * Callers branch on exactly these kinds. Auth (401/403: grant dead, owner must reconnect, 409) must
 * stay distinct from 429/5xx (retry later, 502): collapsing them sends owners through a pointless
 * OAuth round trip during a Google outage, or leaves them with a retry button that can never succeed.
 */
export abstract class ProviderError extends Error {
  protected constructor(message: string, cause?: unknown) {
    // `{ cause }`, not a parameter property: Error already declares `cause`, which a property would shadow.
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
  }
}

/** 401/403: the grant is revoked, expired, or missing a scope. */
export class ProviderAuthError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** 429 or a provider quota error. Retryable with backoff. */
export class ProviderRateLimitError extends ProviderError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number | null = null,
    cause?: unknown
  ) {
    super(message, cause);
  }
}

/** 5xx, or the request never completed. Retryable. */
export class ProviderUnavailableError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** Well-formed HTTP but unmappable (unknown `starRating`, missing required field). Never retryable: the same request yields the same response. */
export class ProviderMappingError extends ProviderError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** A 404: the thing asked about no longer exists on the provider, e.g. a review its author deleted. Never retryable. */
export class ProviderNotFoundError extends ProviderMappingError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
  }
}

/** No provider client id/secret on the server. An operator problem, unlike ProviderAuthError: a 409 "reconnect" here would loop owners forever. */
export class ProviderNotConfiguredError extends ProviderError {
  constructor(message: string) {
    super(message);
  }
}
