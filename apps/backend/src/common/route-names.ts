export enum RouteNames {
  METRICS = 'metrics',
  HEALTH = 'health',
  AUTH = 'auth',
  CONNECTIONS = 'connections',
  REVIEWS = 'reviews',
  DASHBOARD = 'dashboard',
  PROMPTS = 'prompts',
  SETTINGS = 'settings',
  // A file download, not an enveloped response.
  SETTINGS_EXPORT = 'export',
  BLOCKLIST_TERMS = 'blocklist-terms',
  NOTIFICATIONS = 'notifications',
  // Both nested under RouteNames.NOTIFICATIONS. `read-all` is a single segment and
  // `:notificationId/read` is two, so neither can shadow the other however they're ordered.
  NOTIFICATION_BY_ID_READ = ':notificationId/read',
  NOTIFICATIONS_READ_ALL = 'read-all',
  // Settings-owned recipient config, read by the notifications fan-out but never written by it.
  NOTIFICATION_RECIPIENTS = 'notification-recipients',
  NOTIFICATION_RECIPIENT_BY_ID = ':recipientId',
  // Public (no auth) — read-only, reused as a nested segment under RouteNames.ADMIN_SETTINGS too
  // for the platform-admin write side of the same resource.
  PLATFORM_CONFIG = 'platform-config',
  API_DOCS = 'api',

  QUEUES_UI = 'admin/queues',
  HEALTH_LIVE = 'live',
  HEALTH_READY = 'ready',
  LOGIN = 'login',
  LOGOUT = 'logout',
  SIGNUP = 'signup',
  REFRESH = 'refresh',
  ME = 'me',
  CHANGE_PASSWORD = 'change-password',
  SET_PASSWORD = 'set-password',
  REQUEST_SET_PASSWORD_OTP = 'set-password/request-otp',
  DELETE_ACCOUNT = 'delete-account',
  REQUEST_DELETE_ACCOUNT_OTP = 'delete-account/request-otp',
  RESTORE_ACCOUNT = 'restore-account',
  UPDATE_LOCALE = 'locale',
  // `authorize` mirrors GOOGLE_AUTHORIZE's naming for an externally-mediated first step.
  AVATAR_AUTHORIZE = 'avatar/authorize',
  AVATAR_CONFIRM = 'avatar/confirm',
  VERIFY_EMAIL = 'verify-email',
  RESEND_VERIFICATION_OTP = 'resend-verification-otp',
  SSO_COMPLETE_SIGNUP = 'sso/complete-signup',
  // Microsoft (Entra ID) tenant sign-in/sign-up — mirrors GOOGLE / GOOGLE_CALLBACK below.
  MICROSOFT = 'microsoft',
  MICROSOFT_CALLBACK = 'microsoft/callback',
  // Platform-admin login + invite acceptance, all public on ADMIN_AUTH (not ADMIN_SETTINGS, which is
  // PLATFORM_ADMIN-gated). ':token' is the raw invite token, not an id.
  //
  // Not ADMIN_-prefixed: AuthController reuses these three at RouteNames.AUTH for the tenant-member invite
  // flow, so /v1/auth/invite/* mirrors /v1/admin/auth/invite/*.
  ADMIN_AUTH = 'admin/auth',
  INVITE_VALIDATE = 'invite/:token',
  INVITE_ACCEPT = 'invite/accept',
  INVITE_GOOGLE = 'invite/:token/google',
  GOOGLE_AUTHORIZE = 'google/authorize',
  GOOGLE_CALLBACK = 'google/callback',
  GOOGLE = 'google',
  GOOGLE_AVAILABLE_LOCATIONS = 'google/available-locations',
  // Between consent and a connection, when the grant manages several Business Profile accounts.
  GOOGLE_PENDING_ACCOUNTS = 'google/accounts/pending',
  GOOGLE_SELECT_ACCOUNT = 'google/accounts/select',
  LOCATIONS = 'locations',
  ACTIVE_LOCATION = 'active-location',
  LOCATION_BACKFILL = 'locations/:locationId/backfill',
  LOCATION_SYNC_HEALTH = 'locations/:locationId/sync-health',
  LOCATION_SYNC_RUNS = 'locations/:locationId/sync-runs',

  REVIEW_BY_ID = ':reviewId',
  REVIEW_RESPONSES = ':reviewId/responses',
  REVIEW_RESPONSE_APPROVE = ':reviewId/responses/:responseId/approve',
  REVIEW_RESPONSE_REJECT = ':reviewId/responses/:responseId/reject',
  REVIEW_RESPONSE_RETRY_POST = ':reviewId/responses/:responseId/retry-post',
  REVIEW_RESPONSE_POST = ':reviewId/responses/:responseId/post',
  REVIEW_RESPONSE_POST_STATUS = ':reviewId/responses/:responseId/post-status',

  // PROMPT_STATS_BATCH is its own static segment: it takes a POST body of (promptId, version) pairs, not a :promptId param.
  PROMPT_STATS = ':promptId/stats',
  PROMPT_STATS_BATCH = 'stats/batch',

  DASHBOARD_RECENT_ESCALATED = 'recent-escalated',

  // Gated by @Roles(JwtTokenType.PLATFORM_ADMIN), never tenant-scoped.
  ADMIN_USERS = 'admin/users',
  ADMIN_USER_TOGGLE_ACTIVE = ':userId/toggle-active',
  ADMIN_BUSINESSES = 'admin/businesses',
  ADMIN_BUSINESS_STATUS = ':tenantId/status',
  ADMIN_BUSINESS_REQUEST_ERASURE = ':tenantId/request-erasure',
  ADMIN_BUSINESS_CANCEL_ERASURE = ':tenantId/cancel-erasure',
  ADMIN_SETTINGS = 'admin/settings',
  ADMIN_SETTINGS_PROFILE = 'profile',
  ADMIN_SETTINGS_AVATAR_AUTHORIZE = 'profile/avatar/authorize',
  ADMIN_SETTINGS_AVATAR_CONFIRM = 'profile/avatar/confirm',
  ADMIN_SETTINGS_CHANGE_PASSWORD = 'profile/change-password',
  ADMIN_SETTINGS_REQUEST_SET_PASSWORD_OTP = 'profile/set-password/request-otp',
  ADMIN_SETTINGS_SET_PASSWORD = 'profile/set-password',
  ADMIN_SETTINGS_LOCALE = 'profile/locale',
  ADMIN_SETTINGS_INVITES = 'invites',
  ADMIN_SETTINGS_INVITE_BY_ID = 'invites/:inviteId',
  ADMIN_SETTINGS_ADMIN_STATUS = 'admins/:adminId/status',
  // Same slug as PLATFORM_CONFIG on purpose (public read at /v1/settings/platform-config, admin write under
  // /v1/admin/settings/), but a separate member so the two can diverge without silently repointing the other.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  ADMIN_SETTINGS_PLATFORM_CONFIG = 'platform-config',
  ADMIN_OVERVIEW = 'admin/overview',
  ADMIN_OVERVIEW_STATS = 'stats',
  ADMIN_OVERVIEW_RECENT_BUSINESSES = 'recent-businesses',
  ADMIN_OVERVIEW_NEEDS_ATTENTION = 'needs-attention',
  ADMIN_OVERVIEW_SIGNUP_TREND = 'signup-trend',
  ADMIN_OVERVIEW_ACTIVITY = 'activity',
  // Paginated history; ADMIN_OVERVIEW_ACTIVITY is a bounded top-N read without offset/total/type filter.
  ADMIN_OVERVIEW_ACTIVITY_LOG = 'activity-log',

  ADMIN_STATISTICS = 'admin/statistics',
  ADMIN_STATISTICS_SUMMARY = 'summary',

  ADMIN_BILLING = 'admin/billing',
  // Same literal as ADMIN_STATISTICS_SUMMARY; the routes sit under different controller prefixes.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  ADMIN_BILLING_SUMMARY = 'summary',
  // Called on every `/admin/*` page load to decide whether the Billing nav item stays visible while `PAYMENT_FEATURE_ENABLED` is off.
  ADMIN_BILLING_HAS_PAID_TENANTS = 'has-paid-tenants',
  // Separate from ADMIN_BILLING_SUMMARY: a log an admin pages/filters, not a one-shot figure.
  ADMIN_BILLING_WEBHOOK_EVENTS = 'webhook-events',
  ADMIN_BILLING_RESOLVE_POST_ERASURE_CHARGE = 'post-erasure-charges/:receiptId/resolve',

  // Owner-only (@Roles(UserRole.OWNER)), nested under RouteNames.SETTINGS.
  MEMBERS = 'members',
  MEMBER_BY_ID = ':memberId',
  MEMBER_REQUEST_REMOVAL = ':memberId/request-removal',
  MEMBER_CANCEL_REMOVAL = ':memberId/cancel-removal',

  // BillingController and BillingWebhooksController both mount at this prefix.
  BILLING = 'billing',
  BILLING_PLANS = 'plans',
  BILLING_SUBSCRIPTION = 'subscription',
  BILLING_CHECKOUT = 'checkout',
  // Reads the Checkout Session straight from Stripe so a missed or delayed checkout.session.completed webhook never leaves the tenant reading as unpaid.
  BILLING_CHECKOUT_RECONCILE = 'checkout/reconcile',
  BILLING_PORTAL = 'portal',
  // Calls the payment provider directly (no hosted-portal redirect).
  BILLING_CANCEL = 'cancel',
  // Same literal as ACTIVE_LOCATION (connections module); different owners.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  BILLING_ACTIVE_LOCATION = 'active-location',
  BILLING_WEBHOOKS_STRIPE = 'webhooks/stripe',
  BILLING_RECEIPTS = 'receipts',
  BILLING_RECEIPT_PDF = ':receiptId/pdf',
  // Same literal as ADMIN_SETTINGS_PROFILE; different owners.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  BILLING_PROFILE = 'profile',
  BILLING_SETUP_INTENT = 'setup-intent',
  BILLING_PAYMENT_METHOD = 'payment-method',
}
