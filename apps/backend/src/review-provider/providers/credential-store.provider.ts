import type { ProviderTokenSet } from '../types/review-provider.type';

/** The access token is deliberately not stored: it is short-lived and re-minted on demand, so persisting it only widens the blast radius. */
export interface StoredCredential {
  refreshToken: string;
  scope?: string;
}

/**
 * `credential_reference` is a pointer, never the token: a Postgres column leaks into backups,
 * replicas, dumps and the audit trigger. References are scheme-prefixed (`local-redis:<uuid>`,
 * `aws-sm:<path>`) and `get()` asserts the scheme; otherwise a wrong-scheme reference resolves to
 * `null` and the owner is told to reconnect a grant that was never broken.
 */
export abstract class CredentialStoreProvider {
  abstract readonly scheme: string;

  abstract put(credential: StoredCredential): Promise<string>;

  /** In place, so a reconnect doesn't orphan the old secret. */
  abstract update(reference: string, credential: StoredCredential): Promise<void>;

  /** `null` for an unknown reference: a real state after a Redis flush, not an error. */
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
