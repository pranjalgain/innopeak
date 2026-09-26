import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { isProduction } from '@config/deployment-target.util';
import type { LocationRow } from '@db/repositories/connections/connections.repository';
import type { SyncRunRow } from '@db/repositories/review-sync/review-sync.repository';
import { GOOGLE_OAUTH } from '@review-provider/constants/review-provider.constants';
import type { CookieOptions } from 'express';

import {
  OAUTH_SID_COOKIE_PATH,
  OAUTH_STATE_TTL_SECONDS,
  STALE_RUN_MINUTES,
} from '../constants/connections.constants';
import type { LocationDto } from '../dto/connection-response.dto';

/**
 * `SameSite=Lax`, not Strict: the callback arrives as a top-level GET navigation from Google,
 * which Lax permits and Strict does not — Strict would drop the cookie on exactly the request
 * that needs it and make every legitimate connect fail as INVALID_STATE.
 *
 * Path-scoped to /v1/connections so it is never sent on any other request, and short-lived
 * because a consent round trip that takes more than ten minutes has been abandoned.
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

/**
 * A token response with no `scope` field is accepted: Google only omits it when every requested
 * scope was granted, so absence is not the same signal as a list that lacks `business.manage`.
 */
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

/**
 * `null` whenever there is no denominator **or the denominator is zero** — never a synthesized
 * percentage. A location with zero reviews would otherwise divide by zero and produce `NaN`,
 * which serializes to `null` in JSON anyway but only by accident.
 */
export function computeBackfillProgress(run: SyncRunRow | null): number | null {
  if (!run?.reviewsTotal) {
    return null;
  }

  const fetched = run.reviewsFetched ?? 0;
  return Math.min(100, Math.round((fetched / run.reviewsTotal) * 100));
}

/**
 * Measured from the last *progress* write, not from `started_at` — the job updates
 * `reviews_fetched` (and `updated_at`) after every page, so a legitimately long import is not
 * reported as stale simply for being long. Uses `startedAt` when a run has written nothing yet.
 *
 * The UI treats this as "taking longer than usual" copy rather than a failure, because the run
 * may still be alive; what makes it actionable is that acquisition will now reclaim it.
 */
export function isSyncRunStale(run: SyncRunRow | null): boolean {
  if (run?.status !== SyncRunStatus.RUNNING) {
    return false;
  }

  // Same predicate the database reclaim uses — GREATEST(started_at, updated_at) — so the API
  // and the lock can never disagree about whether a run is wedged.
  const lastActivity = Math.max(
    new Date(run.startedAt).getTime(),
    new Date(run.updatedAt).getTime()
  );
  return Date.now() - lastActivity > STALE_RUN_MINUTES * 60 * 1000;
}
