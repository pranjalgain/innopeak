/**
 * Display-only mirror of the backend's `ERASURE_GRACE_PERIOD_DAYS` default
 * (apps/backend/src/common/constants/erasure.constants.ts) — the API never returns the
 * configured grace period itself, only `erasureRequestedAt`, so the "takes effect on {date}" copy
 * on both the admin businesses view and the settings members section computes the date from this
 * constant. If the env var is ever overridden away from its default in a real environment, this
 * display copy would need to be updated to match — there is no way to read the live value from
 * the client today.
 */
export const ERASURE_GRACE_PERIOD_DAYS = 21;
