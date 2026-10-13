/**
 * Fallback for the grace period (days between a business being scheduled for erasure and its data being erased) while the
 * platform settings are still loading. The live value is the backend's `ERASURE_GRACE_PERIOD_DAYS`, served as
 * `erasureGracePeriodDays` on `GET /v1/settings/platform-config` and read through `useErasureGracePeriodDays`; this mirrors the
 * backend's default (apps/backend/src/common/constants/erasure.constants.ts).
 */
export const DEFAULT_ERASURE_GRACE_PERIOD_DAYS = 21;
