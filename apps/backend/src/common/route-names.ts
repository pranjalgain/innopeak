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

  TEST = 'test',
  CUSTOM = 'custom',
  STATUS = 'status',
}
