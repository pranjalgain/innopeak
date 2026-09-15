export enum RouteNames {
  // Slug routes
  METRICS = 'metrics',
  HEALTH = 'health',
  AUTH = 'auth',
  CONNECTIONS = 'connections',
  REVIEWS = 'reviews',
  DASHBOARD = 'dashboard',
  PROMPTS = 'prompts',
  SETTINGS = 'settings',
  BLOCKLIST_TERMS = 'blocklist-terms',
  // Public (no auth) — read-only, reused as a nested segment under RouteNames.ADMIN_SETTINGS too
  // for the platform-admin write side of the same resource.
  PLATFORM_CONFIG = 'platform-config',
  API_DOCS = 'api',
  TRACING = 'tracing',

  // Named routes
  DEV_TOOLS = 'dev-tools',
  DEV_TOOLS_QUEUES = 'queues',
  QUEUES_UI = 'admin/queues',
  HEALTH_UI = 'health-ui',
  LOGIN = 'login',
  LOGOUT = 'logout',
  SIGNUP = 'signup',
  REFRESH = 'refresh',
  ME = 'me',
  CHANGE_PASSWORD = 'change-password',
  SET_PASSWORD = 'set-password',
  UPDATE_LOCALE = 'locale',
  VERIFY_EMAIL = 'verify-email',
  RESEND_VERIFICATION_OTP = 'resend-verification-otp',
  GOOGLE_COMPLETE_SIGNUP = 'google/complete-signup',
  // Connections module — nested segments under RouteNames.CONNECTIONS
  GOOGLE_AUTHORIZE = 'google/authorize',
  GOOGLE_CALLBACK = 'google/callback',
  GOOGLE = 'google',
  GOOGLE_AVAILABLE_LOCATIONS = 'google/available-locations',
  LOCATIONS = 'locations',
  LOCATION_BACKFILL = 'locations/:locationId/backfill',
  LOCATION_SYNC_HEALTH = 'locations/:locationId/sync-health',
  LOCATION_SYNC_RUNS = 'locations/:locationId/sync-runs',

  // Reviews module
  REVIEW_BY_ID = ':reviewId',

  // Dashboard module — nested segment under RouteNames.DASHBOARD. The `metrics` route (reusing
  // METRICS above) now also carries the rating distribution, so there is no separate segment for
  // it any more.
  DASHBOARD_RECENT_ESCALATED = 'recent-escalated',

  // Admin module (Super Admin area) — every route here is gated by
  // @Roles(JwtTokenType.PLATFORM_ADMIN), never a tenant-scoped route.
  ADMIN_USERS = 'admin/users',
  ADMIN_USER_TOGGLE_ACTIVE = ':userId/toggle-active',
  ADMIN_BUSINESSES = 'admin/businesses',
  ADMIN_BUSINESS_STATUS = ':tenantId/status',
  ADMIN_SETTINGS = 'admin/settings',
  ADMIN_SETTINGS_PROFILE = 'profile',
  ADMIN_SETTINGS_PROFILE_AVATAR = 'profile/avatar',
  ADMIN_SETTINGS_CHANGE_PASSWORD = 'profile/change-password',
  ADMIN_SETTINGS_INVITES = 'invites',
  ADMIN_SETTINGS_INVITE_BY_ID = 'invites/:inviteId',
  ADMIN_SETTINGS_ADMIN_STATUS = 'admins/:adminId/status',
  // Deliberately the same slug as PLATFORM_CONFIG above: one resource, two routes — the public
  // read at `/v1/settings/platform-config` and the platform-admin write nested under
  // `/v1/admin/settings/`. Kept as its own member rather than reusing PLATFORM_CONFIG so the two
  // can diverge without silently repointing the other, which is exactly what the rule below
  // cannot distinguish from a copy-paste mistake.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  ADMIN_SETTINGS_PLATFORM_CONFIG = 'platform-config',
  ADMIN_OVERVIEW = 'admin/overview',
  ADMIN_OVERVIEW_REVIEW_STATS = 'review-stats',
  ADMIN_OVERVIEW_ACTIVITY = 'activity',

  TEST = 'test',
  CUSTOM = 'custom',
  STATUS = 'status',
}
