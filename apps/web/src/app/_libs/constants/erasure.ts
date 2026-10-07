/**
 * Display-only mirror of the backend's `ERASURE_GRACE_PERIOD_DAYS` default
 * (apps/backend/src/common/constants/erasure.constants.ts): the API returns only
 * `erasureRequestedAt`, so the "takes effect on {date}" copy computes from this. Must be updated if
 * the env var is overridden in a real environment; the live value cannot be read client-side.
 */
export const ERASURE_GRACE_PERIOD_DAYS = 21;
