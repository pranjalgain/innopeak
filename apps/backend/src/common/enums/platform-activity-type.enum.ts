/** Mirrors the `platform_activity_type` Postgres enum (`0010_admin_overview.sql`). */
export enum PlatformActivityType {
  BUSINESS_SUSPENDED = 'business_suspended',
  BUSINESS_REACTIVATED = 'business_reactivated',
  ADMIN_INVITE_SENT = 'admin_invite_sent',
  ADMIN_INVITE_REVOKED = 'admin_invite_revoked',
  USER_ACTIVATED = 'user_activated',
  USER_DEACTIVATED = 'user_deactivated',
  ADMIN_DISABLED = 'admin_disabled',
  ADMIN_ENABLED = 'admin_enabled',
}
