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

/** What a caller hands in — the two columns that describe a connection's credential state. */
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
 * Turns a stored `credential_reference` into a usable access token, refreshing when the stored one
 * is at or near expiry.
 *
 * Two things make this less trivial than it looks:
 *
 *  1. **Google's refresh tokens are not single-use, but concurrent refreshes still race.** The API
 *     process (an owner opening Settings) and the worker process (a backfill mid-page) can refresh
 *     the same connection at the same moment, and the loser writes its now-superseded token set
 *     over the winner's. A short Redis lock plus a re-read after acquiring it collapses that to
 *     one refresh, and everyone else uses the cached result.
 *  2. **Google omits `refresh_token` on refresh responses.** Writing the response straight back
 *     would overwrite the stored refresh token with `undefined`, and the connection would work for
 *     exactly one more hour before dying with no way back except re-consent. `mergeStoredCredential`
 *     is what prevents that.
 */
@Injectable()
export class ProviderCredentialService {
  private readonly logger = new Logger(ProviderCredentialService.name);

  constructor(
    private readonly provider: ReviewProvider,
    private readonly credentialStore: CredentialStoreProvider,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {}

  /**
   * Throws `ProviderAuthError` when the credential is gone or the refresh is rejected — callers
   * translate that into `status = 'needs_reauth'` plus a 409, exactly as PLAN.md §8.14 specifies
   * for the poller.
   */
  async resolveAccessToken(input: ResolveAccessTokenInput): Promise<ResolvedAccessToken> {
    const cached = await this.redis.get(`${ACCESS_TOKEN_CACHE_PREFIX}${input.connectionId}`);
    if (cached && !this.isNearExpiry(input.tokenExpiresAt)) {
      return { accessToken: cached, refreshedExpiresAt: null };
    }

    return this.refreshUnderLock(input);
  }

  /** Stores a brand-new grant. Returns the reference to write onto the connection row. */
  async storeNewCredential(tokens: ProviderTokenSet): Promise<string> {
    return this.credentialStore.put(mergeStoredCredential(null, tokens));
  }

  /**
   * Reconnect path: keeps the same reference so the connection row's pointer stays valid, rather
   * than minting a second secret and orphaning the first — except when that reference no longer
   * accepts writes.
   *
   * `disconnect()` schedules the old secret for deletion (`revokeAndDelete` → `delete()`; the AWS
   * store gives it a 7-day recovery window rather than purging it immediately). An owner who
   * reconnects the *same* Google account inside that window hits this same reference, and AWS
   * Secrets Manager refuses `PutSecretValue` against a secret pending deletion
   * (`InvalidRequestException`) — so without a fallback here, that owner could not reconnect their
   * own account at all for up to 7 days, with no recovery but waiting out the window.
   *
   * Falls back to minting a fresh secret when the update fails for any reason — a pending
   * deletion, or the old one already purged past its window — and returns whichever reference now
   * actually holds the tokens, so the caller persists a pointer that resolves.
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

  /** Best-effort revoke + delete. Never throws: a tenant must always be able to disconnect. */
  async revokeAndDelete(reference: string): Promise<boolean> {
    let revoked = false;

    try {
      const stored = await this.credentialStore.get(reference);
      if (stored?.refreshToken) {
        revoked = await this.provider.revoke(stored.refreshToken);
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
      // Someone else is refreshing. Wait briefly and take their result rather than issuing a
      // second refresh whose write would race theirs.
      const token = await this.awaitConcurrentRefresh(input.connectionId);
      if (token) {
        return { accessToken: token, refreshedExpiresAt: null };
      }
      // The holder crashed or is slower than the wait window. Falling through to refresh anyway is
      // safe (Google's refresh tokens are reusable) and strictly better than failing the request.
    }

    try {
      const stored = await this.credentialStore.get(input.credentialReference);

      if (!stored?.refreshToken) {
        throw new ProviderAuthError(
          `No stored refresh token for connection ${input.connectionId}; the owner must reconnect.`
        );
      }

      const tokens = await this.provider.refreshAccessToken(stored.refreshToken);

      // Merge, never replace: the refresh response carries no refresh_token, so a straight write
      // would blank the only thing that keeps this connection alive.
      await this.credentialStore.update(
        input.credentialReference,
        mergeStoredCredential(stored, tokens)
      );
      await this.cacheAccessToken(input.connectionId, tokens);

      return { accessToken: tokens.accessToken, refreshedExpiresAt: tokens.expiresAt };
    } finally {
      // Only delete the lock this call actually holds. Falling through after a timed-out
      // `awaitConcurrentRefresh` (`acquired` false) still refreshes here, but the lock belongs to
      // whichever other call *did* acquire it — deleting it out from under that still-running
      // holder would let a third, redundant refresh start concurrently with it, exactly what the
      // lock exists to prevent.
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
    // Cached for its real lifetime minus the refresh skew, so the cache can never hand back a
    // token that expires between being read and being used a few seconds later.
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
