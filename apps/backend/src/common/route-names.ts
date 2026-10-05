export enum RouteNames {
  // Slug routes
  METRICS = 'metrics',
  HEALTH = 'health',
  AUTH = 'auth',
  CONNECTIONS = 'connections',
  REVIEWS = 'reviews',
  DASHBOARD = 'dashboard',
  PROMPTS = 'prompts',
  AI = 'ai',
  // Nested under RouteNames.AI — exercises the AI generation pipeline against a caller-supplied
  // mock review instead of a real one, without persisting anything to review_responses. See
  // apps/documentation/docs/backend/ai/overview.md.
  AI_DRY_RUN = 'dry-run',
  SETTINGS = 'settings',
  BLOCKLIST_TERMS = 'blocklist-terms',
  NOTIFICATIONS = 'notifications',
  // Both nested under RouteNames.NOTIFICATIONS. `read-all` is a single segment and
  // `:notificationId/read` is two, so neither can shadow the other however they're ordered.
  NOTIFICATION_BY_ID_READ = ':notificationId/read',
  NOTIFICATIONS_READ_ALL = 'read-all',
  // Nested under RouteNames.SETTINGS — settings-owned recipient configuration, read by the
  // notifications module's fan-out but never written by it. See
  // apps/documentation/docs/backend/settings/api-reference.md#notification-recipients.
  NOTIFICATION_RECIPIENTS = 'notification-recipients',
  NOTIFICATION_RECIPIENT_BY_ID = ':recipientId',
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
  REQUEST_SET_PASSWORD_OTP = 'set-password/request-otp',
  UPDATE_LOCALE = 'locale',
  // Direct-to-provider avatar upload — see the ADMIN_SETTINGS_AVATAR_* pair below for the
  // platform-admin counterpart of this same two-step shape. `authorize` matches GOOGLE_AUTHORIZE's
  // own naming below for the same "start this externally-mediated step" shape.
  AVATAR_AUTHORIZE = 'avatar/authorize',
  AVATAR_CONFIRM = 'avatar/confirm',
  VERIFY_EMAIL = 'verify-email',
  RESEND_VERIFICATION_OTP = 'resend-verification-otp',
  GOOGLE_COMPLETE_SIGNUP = 'google/complete-signup',
  // Platform-admin login + invite acceptance — all public, all on RouteNames.ADMIN_AUTH (not
  // RouteNames.ADMIN_SETTINGS, which is gated by @Roles(PLATFORM_ADMIN) and requires the caller to
  // already be one). ':token' segment name deliberately matches SendAdminInviteDto's raw token,
  // not an id — see PlatformAdminAuthService.validateAdminInvite.
  //
  // Deliberately not ADMIN_-prefixed, unlike ADMIN_SETTINGS_INVITES/ADMIN_SETTINGS_INVITE_BY_ID
  // below: these three are reused verbatim by AuthController for the tenant-member invite flow
  // (mounted at RouteNames.AUTH instead of ADMIN_AUTH), giving /v1/auth/invite/* the exact same
  // shape as /v1/admin/auth/invite/* rather than duplicating three near-identical enum members.
  // See apps/documentation/docs/backend/auth/tenant-member-invite-design.md.
  ADMIN_AUTH = 'admin/auth',
  INVITE_VALIDATE = 'invite/:token',
  INVITE_ACCEPT = 'invite/accept',
  INVITE_GOOGLE = 'invite/:token/google',
  // Connections module — nested segments under RouteNames.CONNECTIONS
  GOOGLE_AUTHORIZE = 'google/authorize',
  GOOGLE_CALLBACK = 'google/callback',
  GOOGLE = 'google',
  GOOGLE_AVAILABLE_LOCATIONS = 'google/available-locations',
  LOCATIONS = 'locations',
  ACTIVE_LOCATION = 'active-location',
  LOCATION_BACKFILL = 'locations/:locationId/backfill',
  LOCATION_SYNC_HEALTH = 'locations/:locationId/sync-health',
  LOCATION_SYNC_RUNS = 'locations/:locationId/sync-runs',

  // Reviews module
  REVIEW_BY_ID = ':reviewId',
  REVIEW_RESPONSE_APPROVE = ':reviewId/responses/:responseId/approve',
  REVIEW_RESPONSE_REJECT = ':reviewId/responses/:responseId/reject',

  // Prompts module — nested segments under RouteNames.PROMPTS. PROMPT_STATS_BATCH is a static
  // segment registered as its own route rather than nested under PROMPT_STATS, since the batch
  // endpoint takes a POST body of (promptId, version) pairs instead of a single :promptId param.
  PROMPT_STATS = ':promptId/stats',
  PROMPT_STATS_BATCH = 'stats/batch',

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
  ADMIN_BUSINESS_REQUEST_ERASURE = ':tenantId/request-erasure',
  ADMIN_BUSINESS_CANCEL_ERASURE = ':tenantId/cancel-erasure',
  ADMIN_SETTINGS = 'admin/settings',
  ADMIN_SETTINGS_PROFILE = 'profile',
  // Direct-to-provider avatar upload: mint a signed authorization, then confirm what the client
  // actually uploaded — see MediaService. Same two-step shape as AVATAR_AUTHORIZE/AVATAR_CONFIRM
  // above (the tenant side), one per profile screen.
  ADMIN_SETTINGS_AVATAR_AUTHORIZE = 'profile/avatar/authorize',
  ADMIN_SETTINGS_AVATAR_CONFIRM = 'profile/avatar/confirm',
  ADMIN_SETTINGS_CHANGE_PASSWORD = 'profile/change-password',
  // The admin-side counterpart to AVATAR_AUTHORIZE/SET_PASSWORD's own tenant routes above — same
  // two-step shape (request a step-up OTP, then redeem it) for a Google-only admin adopting a
  // first password.
  ADMIN_SETTINGS_REQUEST_SET_PASSWORD_OTP = 'profile/set-password/request-otp',
  ADMIN_SETTINGS_SET_PASSWORD = 'profile/set-password',
  ADMIN_SETTINGS_LOCALE = 'profile/locale',
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
  ADMIN_OVERVIEW_STATS = 'stats',
  ADMIN_OVERVIEW_RECENT_BUSINESSES = 'recent-businesses',
  ADMIN_OVERVIEW_NEEDS_ATTENTION = 'needs-attention',
  ADMIN_OVERVIEW_SIGNUP_TREND = 'signup-trend',
  ADMIN_OVERVIEW_ACTIVITY = 'activity',
  // Paginated, filterable platform-activity-log history — distinct from ADMIN_OVERVIEW_ACTIVITY
  // above (a bounded "top N" read for the Overview glance card, no offset/total/type filter).
  ADMIN_OVERVIEW_ACTIVITY_LOG = 'activity-log',

  // Deeper platform-wide analytics than Overview's four headline stats — review volume/rating/
  // classification/sync/connection health, all composed into one summary payload per
  // AdminStatisticsController's own doc comment.
  ADMIN_STATISTICS = 'admin/statistics',
  ADMIN_STATISTICS_SUMMARY = 'summary',

  // Platform-admin visibility into billing_plans/tenant_subscriptions/stripe_webhook_events —
  // none of which had any admin-facing surface before this. One summary payload, same reasoning
  // as ADMIN_STATISTICS_SUMMARY above.
  ADMIN_BILLING = 'admin/billing',
  // Deliberately the same literal as ADMIN_STATISTICS_SUMMARY above — two unrelated summary
  // routes nested under their own distinct controller prefixes, same reasoning as
  // ADMIN_SETTINGS_PLATFORM_CONFIG's own duplicate-value comment.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  ADMIN_BILLING_SUMMARY = 'summary',
  // Cheap existence check the admin frontend calls on every `/admin/*` page load to decide
  // whether the Billing nav item stays visible while `PAYMENT_FEATURE_ENABLED` is off — see
  // `AdminBillingService.hasPaidTenants`'s own doc comment.
  ADMIN_BILLING_HAS_PAID_TENANTS = 'has-paid-tenants',
  // Paginated, filterable Stripe webhook activity — its own route rather than folded into
  // ADMIN_BILLING_SUMMARY, since it's a log an admin pages/filters through, not a one-shot figure.
  ADMIN_BILLING_WEBHOOK_EVENTS = 'webhook-events',

  // Tenant team members — owner-authenticated (@Roles(UserRole.OWNER)), nested under
  // RouteNames.SETTINGS. See tenant-member-invite-design.md.
  MEMBERS = 'members',
  MEMBER_BY_ID = ':memberId',
  MEMBER_REQUEST_REMOVAL = ':memberId/request-removal',
  MEMBER_CANCEL_REMOVAL = ':memberId/cancel-removal',

  // Billing module. BillingController and BillingWebhooksController both mount at this same
  // prefix (two controllers, one module — see module-structure.md's "more than one controller"
  // layout), the same way TenantAvatarController/AdminAvatarController share their host
  // controllers' prefixes from a different module.
  BILLING = 'billing',
  BILLING_PLANS = 'plans',
  BILLING_SUBSCRIPTION = 'subscription',
  BILLING_CHECKOUT = 'checkout',
  // Synchronous reconciliation for the checkout-redirect path — see BillingReconciliationService.
  // Reads the Checkout Session straight from Stripe instead of waiting on
  // checkout.session.completed, so a tenant landing on the success page is never stuck reading as
  // unpaid just because that webhook was delayed or missed.
  BILLING_CHECKOUT_RECONCILE = 'checkout/reconcile',
  BILLING_PORTAL = 'portal',
  // In-app cancel — calls the payment provider directly (no hosted-portal redirect) since
  // cancellation itself needs none of the PCI-scoped UI a card update would. Provider-agnostic:
  // works the same whether PAYMENT_PROVIDER is stripe or dummy — see
  // BillingService.cancelSubscription's own doc comment.
  BILLING_CANCEL = 'cancel',
  // Deliberately the same literal as ACTIVE_LOCATION above (connections module) — one concept,
  // two routes with different owners, same reasoning as ADMIN_SETTINGS_PLATFORM_CONFIG's own
  // duplicate-value comment.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  BILLING_ACTIVE_LOCATION = 'active-location',
  BILLING_WEBHOOKS_STRIPE = 'webhooks/stripe',
  // Dummy-provider-only — 404 unless PAYMENT_PROVIDER=dummy. What a real Stripe webhook delivery
  // does automatically, DummyPaymentProvider has no external caller to do for it (its own
  // constructWebhookEvent throws) — this lets the frontend's dummy checkout confirmation page
  // trigger the same BillingWebhooksService state transition directly, authenticated as the
  // tenant owner instead of Stripe's signature. See BillingService.completeDummyCheckout. (The
  // cancel-side counterpart this used to pair with, dummy/cancel-subscription, is gone —
  // consolidated into the provider-agnostic BILLING_CANCEL above.)
  BILLING_DUMMY_COMPLETE_CHECKOUT = 'dummy/complete-checkout',
  // Stripe-only payment receipts (`billing_receipts`, see 0012_billing_receipts.sql) — a list for
  // Settings → Billing's history section, and a per-receipt PDF download. Never populated for
  // PAYMENT_PROVIDER=dummy, since there is no real charge behind a Dummy payment to document.
  BILLING_RECEIPTS = 'receipts',
  BILLING_RECEIPT_PDF = ':receiptId/pdf',
  // In-app "manage billing" — replaces the old redirect-to-hosted-Customer-Portal flow. Stripe-only
  // (see StripeOnlyFeatureException): read/write the Stripe Customer's name/email, and the
  // SetupIntent + confirm-default-payment-method pair behind Stripe Elements card entry.
  // Deliberately the same literal as ADMIN_SETTINGS_PROFILE above — one concept, two routes with
  // different owners, same reasoning as ADMIN_SETTINGS_PLATFORM_CONFIG's own duplicate-value
  // comment.
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  BILLING_PROFILE = 'profile',
  BILLING_SETUP_INTENT = 'setup-intent',
  BILLING_PAYMENT_METHOD = 'payment-method',

  TEST = 'test',
  CUSTOM = 'custom',
  STATUS = 'status',
}
