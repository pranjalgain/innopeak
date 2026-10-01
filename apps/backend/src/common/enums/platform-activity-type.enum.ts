/** Mirrors the `platform_activity_type` Postgres enum (`0009_admin_overview.sql`). */
export enum PlatformActivityType {
  BUSINESS_SUSPENDED = 'business_suspended',
  BUSINESS_REACTIVATED = 'business_reactivated',
  BUSINESS_ERASURE_REQUESTED = 'business_erasure_requested',
  BUSINESS_ERASURE_CANCELLED = 'business_erasure_cancelled',
  BUSINESS_ERASED = 'business_erased',
  ADMIN_INVITE_SENT = 'admin_invite_sent',
  ADMIN_INVITE_REVOKED = 'admin_invite_revoked',
  USER_ACTIVATED = 'user_activated',
  USER_DEACTIVATED = 'user_deactivated',
  ADMIN_DISABLED = 'admin_disabled',
  ADMIN_ENABLED = 'admin_enabled',
}
