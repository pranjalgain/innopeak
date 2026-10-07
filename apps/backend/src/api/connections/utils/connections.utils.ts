import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { isProduction } from '@config/deployment-target.util';
import type { LocationRow } from '@db/repositories/connections/types/connections.type';
import type { SyncRunRow } from '@db/repositories/review-sync/types/review-sync.type';
import { GOOGLE_OAUTH } from '@review-provider/constants/review-provider.constants';
import type { CookieOptions } from 'express';

import {
  OAUTH_SID_COOKIE_PATH,
  OAUTH_STATE_TTL_SECONDS,
  STALE_RUN_MINUTES,
} from '../constants/connections.constants';
import type { LocationDto } from '../dto/connection-response.dto';

/**
 * `SameSite=Lax`, not Strict: the callback is a top-level GET from Google, and Strict would drop
 * the cookie there and fail every connect as INVALID_STATE. Path-scoped and short-lived.
 */
export function buildOauthSidCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: OAUTH_SID_COOKIE_PATH,
    maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
  };
}

/** A missing `scope` is accepted: Google omits it only when every requested scope was granted. */
export function hasRequiredOAuthScope(granted: string | undefined): boolean {
  if (!granted) {
    return true;
  }

  const grantedScopes = new Set(granted.split(' '));
  return GOOGLE_OAUTH.SCOPES.every(scope => grantedScopes.has(scope));
}

export function toLocationDto(location: LocationRow): LocationDto {
  return {
    id: location.id,
    connectionId: location.providerConnectionId,
    provider: location.provider,
    externalLocationId: location.externalLocationId,
    name: location.name,
    address: location.address,
    status: location.status,
    lastSyncedAt: location.lastSyncedAt,
    lastSyncStatus: location.lastSyncStatus,
    lastSyncError: location.lastSyncError,
    onboardingBackfillCompletedAt: location.onboardingBackfillCompletedAt,
    createdAt: location.createdAt,
    billingPausedAt: location.billingPausedAt,
  };
}

/** `null` when there is no denominator or it is zero, rather than a `NaN` that only happens to serialize as null. */
export function computeBackfillProgress(run: SyncRunRow | null): number | null {
  if (!run?.reviewsTotal) {
    return null;
  }

  const fetched = run.reviewsFetched ?? 0;
  return Math.min(100, Math.round((fetched / run.reviewsTotal) * 100));
}

/**
 * Measured from the last progress write, not `started_at`, so a long but advancing import isn't
 * stale. The UI shows "taking longer than usual", not failure, since the run may still be alive.
 */
export function isSyncRunStale(run: SyncRunRow | null): boolean {
  if (run?.status !== SyncRunStatus.RUNNING) {
    return false;
  }

  // Same predicate as the DB reclaim, GREATEST(started_at, updated_at), so API and lock agree.
  const lastActivity = Math.max(
    new Date(run.startedAt).getTime(),
    new Date(run.updatedAt).getTime()
  );
  return Date.now() - lastActivity > STALE_RUN_MINUTES * 60 * 1000;
}
