import type { ProviderTokenSet } from '../types/review-provider.type';

/** What is actually kept for a connection. The access token is *not* stored — it is short-lived
 * and re-minted from the refresh token on demand, so persisting it only widens the blast radius. */
export interface StoredCredential {
  refreshToken: string;
  scope?: string;
}

/**
 * `review_provider_connections.credential_reference` is a `VARCHAR(255)` **pointer**, never the
 * token itself: a Postgres column ends up in backups, read replicas, `pg_dump` output, audit-log
 * rows (this schema has an `AFTER UPDATE` audit trigger on that very table) and any support query
 * someone pastes into a ticket.
 *
 * References are scheme-prefixed — `local-redis:<uuid>` or `aws-sm:<path>` — and `get()` asserts
 * the scheme it is handed. Without that assertion, a production node given a `local-redis:`
 * reference resolves it to `null`, the connection silently flips to `needs_reauth`, and the owner
 * is told to reconnect a grant that was never broken.
 */
export abstract class CredentialStoreProvider {
  /** The prefix this implementation both mints and accepts, e.g. `local-redis`. */
  abstract readonly scheme: string;

  /** Stores the credential and returns the opaque reference to persist on the connection row. */
  abstract put(credential: StoredCredential): Promise<string>;

  /** Overwrites an existing reference in place, so a reconnect doesn't orphan the old secret. */
  abstract update(reference: string, credential: StoredCredential): Promise<void>;

  /** `null` when the reference is unknown — a real state after a Redis flush, not an error. */
  abstract get(reference: string): Promise<StoredCredential | null>;

  abstract delete(reference: string): Promise<void>;
}

/** Google omits `refresh_token` on refresh, so a token set may carry none — keep the stored one. */
export function mergeStoredCredential(
  existing: StoredCredential | null,
  tokens: ProviderTokenSet
): StoredCredential {
  return {
    refreshToken: tokens.refreshToken ?? existing?.refreshToken ?? '',
    ...((tokens.scope ?? existing?.scope) ? { scope: tokens.scope ?? existing?.scope ?? '' } : {}),
  };
}
