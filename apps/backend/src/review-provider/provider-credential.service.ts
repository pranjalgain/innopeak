import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '@redis/redis.provider';
import type Redis from 'ioredis';

import {
  CREDENTIAL_REFRESH_LOCK_TTL_SECONDS,
  TOKEN_REFRESH_SKEW_SECONDS,
} from './constants/review-provider.constants';
import { ProviderAuthError } from './errors/provider.error';
import {
  CredentialStoreProvider,
  mergeStoredCredential,
} from './providers/credential-store.provider';
import { ReviewProvider } from './providers/review-provider.provider';
import type { ProviderTokenSet } from './types/review-provider.type';

export interface ResolveAccessTokenInput {
  connectionId: string;
  credentialReference: string;
  tokenExpiresAt: string | null;
}

export interface ResolvedAccessToken {
  accessToken: string;
  /** Set when this call refreshed — the caller persists it back to `token_expires_at`. */
  refreshedExpiresAt: Date | null;
}

const LOCK_KEY_PREFIX = 'review-credentials:refresh-lock:';
const ACCESS_TOKEN_CACHE_PREFIX = 'review-credentials:access-token:';

/**
 * Turns a stored `credential_reference` into an access token, refreshing near expiry.
 *
 * Concurrent refreshes race (API and worker can refresh one connection at once, and the loser
 * overwrites the winner's token set), so a short Redis lock collapses them into one.
 * Google also omits `refresh_token` on refresh responses; `mergeStoredCredential` keeps the stored
 * one, otherwise the connection dies within an hour with only re-consent as recovery.
 */
@Injectable()
export class ProviderCredentialService {
  private readonly logger = new Logger(ProviderCredentialService.name);

  constructor(
    private readonly provider: ReviewProvider,
    private readonly credentialStore: CredentialStoreProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /** Throws `ProviderAuthError` when the credential is gone or the refresh is rejected; callers map that to `needs_reauth` plus a 409. */
  async resolveAccessToken(input: ResolveAccessTokenInput): Promise<ResolvedAccessToken> {
    const cached = await this.redis.get(`${ACCESS_TOKEN_CACHE_PREFIX}${input.connectionId}`);
    if (cached && !this.isNearExpiry(input.tokenExpiresAt)) {
      return { accessToken: cached, refreshedExpiresAt: null };
    }

    return this.refreshUnderLock(input);
  }

  /**
   * Drops the cached access token. It is keyed by connection, not by credential, so a reconnect or disconnect that changes the grant
   * would otherwise keep serving the old token until it expires: a revoked one 401s straight back into `needs_reauth`, so the
   * reconnect looks like it did nothing. Best-effort: Redis being unreachable must not fail a disconnect.
   */
  async invalidateAccessToken(connectionId: string): Promise<void> {
    try {
      await this.redis.del(`${ACCESS_TOKEN_CACHE_PREFIX}${connectionId}`);
    } catch (error) {
      this.logger.warn(
        `Could not drop the cached access token for connection ${connectionId}: ${(error as Error).message}`
      );
    }
  }

  async storeNewCredential(tokens: ProviderTokenSet): Promise<string> {
    return this.credentialStore.put(mergeStoredCredential(null, tokens));
  }

  /**
   * Reconnect path: reuses the reference so the connection row's pointer stays valid, unless it no
   * longer accepts writes. `disconnect()` leaves the AWS secret pending deletion for 7 days, and
   * Secrets Manager refuses `PutSecretValue` on it, so reconnecting the same Google account in that
   * window would otherwise fail. Falls back to a fresh secret and returns whichever reference now
   * holds the tokens.
   */
  async replaceCredential(reference: string, tokens: ProviderTokenSet): Promise<string> {
    const existing = await this.credentialStore.get(reference).catch(() => null);
    const merged = mergeStoredCredential(existing, tokens);

    try {
      await this.credentialStore.update(reference, merged);
      return reference;
    } catch (error) {
      this.logger.warn(
        `Could not update credential ${reference}, most likely pending deletion from a recent ` +
          `disconnect; minting a fresh one instead: ${(error as Error).message}`
      );
      return this.credentialStore.put(merged);
    }
  }

  /**
   * Erasure purge variant of `revokeAndDelete`: throws and keeps the credential if the grant can't
   * be revoked, so the tenant is retried tomorrow rather than erased with a live grant.
   */
  async revokeOrThrow(reference: string): Promise<void> {
    const stored = await this.credentialStore.get(reference);
    if (stored?.refreshToken && !(await this.provider.revoke(stored.refreshToken))) {
      throw new Error('Google did not confirm the revocation of the stored grant');
    }
    await this.credentialStore.delete(reference);
  }

  /**
   * Best-effort revoke + delete. Never throws: a tenant must always be able to disconnect.
   *
   * `keepIfNotRevoked`: when Google did not confirm the revocation, leave the stored credential in place instead of deleting it. Deleting it
   * left a live grant at Google that nothing could ever revoke (the token was the only handle); kept, the erasure purge revokes it
   * (`revokeOrThrow`), and a reconnect to the same account reuses the slot. The caller reports `false` so the owner knows.
   */
  async revokeAndDelete(
    reference: string,
    options: { keepIfNotRevoked?: boolean } = {}
  ): Promise<boolean> {
    let revoked = false;

    try {
      const stored = await this.credentialStore.get(reference);
      if (stored?.refreshToken) {
        revoked = await this.provider.revoke(stored.refreshToken);
        if (!revoked && options.keepIfNotRevoked === true) {
          this.logger.warn(
            `Google did not confirm the revocation of credential ${reference}; keeping it so the grant can still be revoked later.`
          );
          return false;
        }
      }
      await this.credentialStore.delete(reference);
    } catch (error) {
      this.logger.warn(
        `Failed to fully revoke credential ${reference}: ${(error as Error).message}`
      );
    }

    return revoked;
  }

  private async refreshUnderLock(input: ResolveAccessTokenInput): Promise<ResolvedAccessToken> {
    const lockKey = `${LOCK_KEY_PREFIX}${input.connectionId}`;
    const acquired = await this.redis.set(
      lockKey,
      '1',
      'EX',
      CREDENTIAL_REFRESH_LOCK_TTL_SECONDS,
      'NX'
    );

    if (!acquired) {
      // Someone else is refreshing; take their result rather than race their write.
      const token = await this.awaitConcurrentRefresh(input.connectionId);
      if (token) {
        return { accessToken: token, refreshedExpiresAt: null };
      }
      // Holder crashed or is slow: refreshing anyway is safe (Google's refresh tokens are reusable).
    }

    try {
      const stored = await this.credentialStore.get(input.credentialReference);

      if (!stored?.refreshToken) {
        throw new ProviderAuthError(
          `No stored refresh token for connection ${input.connectionId}; the owner must reconnect.`
        );
      }

      const tokens = await this.provider.refreshAccessToken(stored.refreshToken);

      // Merge, never replace: the response has no refresh_token, so a straight write would blank it.
      await this.credentialStore.update(
        input.credentialReference,
        mergeStoredCredential(stored, tokens)
      );
      await this.cacheAccessToken(input.connectionId, tokens);

      return { accessToken: tokens.accessToken, refreshedExpiresAt: tokens.expiresAt };
    } finally {
      // Only release a lock this call holds: after a timed-out wait the lock belongs to another
      // still-running refresh, and deleting it would let a third refresh start concurrently.
      if (acquired) {
        await this.redis.del(lockKey);
      }
    }
  }

  private async awaitConcurrentRefresh(connectionId: string): Promise<string | null> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
      const token = await this.redis.get(`${ACCESS_TOKEN_CACHE_PREFIX}${connectionId}`);
      if (token) {
        return token;
      }
    }

    return null;
  }

  private async cacheAccessToken(connectionId: string, tokens: ProviderTokenSet): Promise<void> {
    // Minus the refresh skew, so the cache never returns a token about to expire.
    const ttl = Math.max(
      60,
      Math.floor((tokens.expiresAt.getTime() - Date.now()) / 1000) - TOKEN_REFRESH_SKEW_SECONDS
    );

    await this.redis.set(
      `${ACCESS_TOKEN_CACHE_PREFIX}${connectionId}`,
      tokens.accessToken,
      'EX',
      ttl
    );
  }

  private isNearExpiry(tokenExpiresAt: string | null): boolean {
    if (!tokenExpiresAt) {
      return true;
    }

    return new Date(tokenExpiresAt).getTime() - Date.now() <= TOKEN_REFRESH_SKEW_SECONDS * 1000;
  }
}
