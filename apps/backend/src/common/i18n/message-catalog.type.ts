/**
 * An explicit interface, not `typeof messagesEn`, so a missing/extra key or mismatched function
 * signature is a compile error in the German file itself (`typeof messagesEn` would need its
 * literal types widened and would blame the wrong file).
 */
export interface MessageCatalog {
  AUTH: {
    SIGNUP_OTP_SENT: (email: string) => string;
    LOGIN_OTP_SENT: (email: string) => string;
    RESEND_OTP_ACK: string;
    EMAIL_VERIFIED: string;
    EMAIL_ALREADY_REGISTERED: string;
    /** `platform_settings.password_login_enabled` is off: new email/password sign-ups are refused. */
    PASSWORD_SIGNUP_DISABLED: string;
    /** `platform_settings.password_login_enabled` is off: email/password sign-in, code verification and password invitations are refused. */
    PASSWORD_LOGIN_DISABLED: string;
    /** The provider a pending single-sign-on sign-up came through was switched off before the business name step. */
    SSO_SIGNUP_DISABLED: string;
    INVALID_OR_EXPIRED_OTP: string;
    TOO_MANY_OTP_ATTEMPTS: string;
    INVALID_CREDENTIALS: string;
    ACCOUNT_DISABLED: string;
    TENANT_SUSPENDED: string;
    INVALID_REFRESH_TOKEN: string;
    INVALID_ACCESS_TOKEN: string;
    LOGGED_OUT: string;
    INVALID_CURRENT_PASSWORD: string;
    /** Change-password with a new password identical to the current one. */
    NEW_PASSWORD_SAME_AS_CURRENT: string;
    NO_PASSWORD_SET: string;
    PASSWORD_ALREADY_SET: string;
    PASSWORD_CHANGED: string;
    PASSWORD_SET: string;
    SET_PASSWORD_OTP_ACK: string;
    BUSINESS_NAME_MISMATCH: string;
    PASSWORD_REQUIRED_TO_DELETE: string;
    DELETE_ACCOUNT_OTP_ACK: string;
    ACCOUNT_DELETION_NOT_POSSIBLE: string;
    ACCOUNT_DELETION_SCHEDULED: string;
    ACCOUNT_SCHEDULED_FOR_DELETION: (date: string) => string;
    ACCOUNT_RESTORED: string;
    LOCALE_UPDATED: string;
    AVATAR_UPDATED: string;
    TENANT_ONLY: string;
    GOOGLE_NOT_CONFIGURED: string;
    SSO_PENDING_SIGNUP_EXPIRED: string;
    TENANT_CONTEXT_REQUIRED: string;
    /** One message for never-existed, used, or expired tokens (no enumeration), across all invite accept paths. */
    INVALID_OR_EXPIRED_INVITE: string;
    INVITE_ACCEPTED: string;
    /** Invariant guards: the insert affected no rows, which should never happen. */
    FAILED_TO_CREATE_TENANT: string;
    FAILED_TO_CREATE_USER: string;
    FAILED_TO_CREATE_INVITED_MEMBER: string;
  };
  MEDIA: {
    /** Deliberately generic (asset missing or outside the expected folder): the reason is only logged, since it may be someone probing the confirm endpoint with made-up ids. */
    UPLOAD_NOT_VERIFIED: string;
    /** Safe to be specific (unlike `UPLOAD_NOT_VERIFIED`): reaching it requires a real asset the caller just uploaded under its own signed authorization. */
    UNSUPPORTED_FORMAT: string;
    /** Specific for the same reason as `UNSUPPORTED_FORMAT`. */
    FILE_TOO_LARGE: string;
    FAILED_TO_PERSIST_AVATAR: string;
    /** `CLOUDINARY_*` is unset on this server. */
    STORAGE_NOT_CONFIGURED: string;
  };
  NOTIFICATIONS: {
    LISTED: string;
    NOT_FOUND: string;
    MARKED_READ: string;
    MARKED_ALL_READ: string;
    /**
     * Bell-feed text, rendered once per recipient in their own locale and stored on the row (so a later wording change never rewrites
     * history). Read from the catalogs directly (`in-app-notification-copy.util.ts`), not through the tagged `MESSAGES`.
     */
    FEED: {
      REVIEW_ESCALATED_TITLE: string;
      REVIEW_ESCALATED_DESCRIPTION: (rating: number) => string;
      REVIEW_ESCALATED_SUMMARY_TITLE: (count: number) => string;
      REVIEW_ESCALATED_SUMMARY_DESCRIPTION: string;
      REPLY_NEEDS_APPROVAL_TITLE: string;
      REPLY_NEEDS_APPROVAL_DESCRIPTION: (rating: number) => string;
      REPLY_NEEDS_APPROVAL_SUMMARY_TITLE: (count: number) => string;
      REPLY_NEEDS_APPROVAL_SUMMARY_DESCRIPTION: string;
      REPLY_APPROVED_TITLE: string;
      REPLY_APPROVED_DESCRIPTION: (rating: number) => string;
      REPLY_APPROVED_SUMMARY_TITLE: (count: number) => string;
      REPLY_APPROVED_SUMMARY_DESCRIPTION: string;
      CONNECTION_ISSUE_TITLE: string;
      CONNECTION_ISSUE_DESCRIPTION: string;
    };
  };
  CONNECTIONS: {
    CONNECTION_NOT_FOUND: string;
    LOCATION_NOT_FOUND: string;
    EXTERNAL_LOCATION_NOT_FOUND: string;
    CONNECTION_NEEDS_REAUTH: string;
    LOCATION_LIMIT_REACHED: string;
    BACKFILL_ENQUEUE_FAILED: string;
    PROVIDER_UNAVAILABLE: string;
    PROVIDER_NOT_CONFIGURED: string;
    /** The pending account choice is gone (15-minute TTL, already used, or started by someone else). */
    ACCOUNT_CHOICE_EXPIRED: string;
    ACCOUNT_NOT_IN_CHOICE: string;
    /** A live connection to a different account already exists. */
    ACCOUNT_MISMATCH: string;
    DISCONNECTED: string;
    LOCATION_CONFIRMED: string;
    LOCATION_INACTIVE: string;
    LOCATION_BILLING_PAUSED: string;
    ACTIVE_LOCATION_UPDATED: string;
    FAILED_TO_UPSERT_CONNECTION: string;
    FAILED_TO_UPSERT_LOCATION: string;
  };
  DASHBOARD: {
    TENANT_ONLY: string;
  };
  REVIEWS: {
    REVIEW_NOT_FOUND: string;
    TENANT_ONLY: string;
    FAILED_TO_ACQUIRE_SYNC_RUN: string;
    /** Shown on a sync run that is waiting out Google's rate limit before retrying (replaced when the run ends). */
    SYNC_WAITING_FOR_RATE_LIMIT: (seconds: number, attempt: number, maxAttempts: number) => string;
    /** What a failed sync stores for the owner to read: our own wording, never the provider's raw error text. */
    SYNC_FAILED_AUTH: string;
    SYNC_FAILED_RATE_LIMITED: string;
    SYNC_FAILED_UNAVAILABLE: string;
    SYNC_FAILED_CLASSIFICATION: string;
    SYNC_FAILED_UNKNOWN: string;
    FAILED_TO_UPSERT_REVIEW: string;
    /** Interpolating so the review id survives into the English server log while the client copy stays generic in production (`ErrorHandlerService`). */
    GENERATED_RESPONSE_INSERT_FAILED: (reviewId: string) => string;
    RESPONSE_NOT_FOUND: string;
    /** Not `pending_approval` (already decided, or a sibling won); 409 not 404, since the row exists. */
    RESPONSE_NOT_ACTIONABLE: string;
    /** `idx_review_responses_review_id_live_reply`: a sibling already won the approve race. */
    RESPONSE_ALREADY_LIVE: string;
    RESPONSE_APPROVED: string;
    RESPONSE_REJECTED: string;
    /** `retry-post` only accepts `post_failed`. */
    RESPONSE_NOT_RETRYABLE: string;
    /** The manual post route only accepts `approved`. */
    RESPONSE_NOT_POSTABLE: string;
    /** Same unique violation as `RESPONSE_ALREADY_LIVE` but on manual-reply/retry/post; separate code because client copy differs. */
    REVIEW_ALREADY_HAS_LIVE_REPLY: string;
    REVIEW_ALREADY_DISMISSED: string;
    /** `removed_upstream_at` is set: the reviewer deleted it on Google. */
    REVIEW_REMOVED_UPSTREAM: string;
    /** The review's location is paused by the plan or disconnected: nothing can be approved or posted for it. */
    REVIEW_LOCATION_PAUSED: string;
    POST_QUEUE_UNAVAILABLE: string;
    /** Recorded as `error_message`; nothing was sent to Google. */
    POST_FAILED_REVIEW_REMOVED: string;
    /** Google can't find the review's location (moved out of the connected account, or deleted). */
    POST_FAILED_LOCATION_UNAVAILABLE: string;
    POST_FAILED_LOCATION_PAUSED: string;
    /** Google refused the credential; the owner has to reconnect. */
    POST_FAILED_RECONNECT: string;
    /** Google refused the reply itself (a 4xx other than auth/404, e.g. text it won't accept). */
    POST_FAILED_REJECTED: string;
    /** Google was rate limiting or down and the retries ran out. */
    POST_FAILED_UNAVAILABLE: string;
    /** Anything else; the detail is in the server log. */
    POST_FAILED_UNKNOWN: string;
    MANUAL_REPLY_INSERT_FAILED: (reviewId: string) => string;
    MANUAL_REPLY_CREATED: string;
    RESPONSE_POST_QUEUED: string;
    RESPONSE_RETRY_QUEUED: string;
    POST_STATUS_RETRIEVED: string;
  };
  PROMPTS: {
    LISTED: string;
    VERSION_CREATED: string;
    TONE_UPDATED: string;
    NOT_FOUND: string;
    TEMPLATE_UNCHANGED: string;
    VERSION_CONFLICT: string;
    UNKNOWN_VARIABLE: (names: readonly string[]) => string;
    MISSING_VARIABLE: (names: readonly string[]) => string;
    TENANT_ONLY: string;
    STATS_RETRIEVED: string;
    VERSION_NOT_FOUND: string;
    STATS_BATCH_RETRIEVED: string;
  };
  AI: {
    /** Every tenant is seeded with all three categories at signup, so this is a data-integrity fallback. */
    PROMPT_NOT_CONFIGURED: string;
    /** `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` unset; checked lazily on first call, not at boot. */
    PROVIDER_NOT_CONFIGURED: string;
    /** An `AZURE_OPENAI_*` setting is unset. */
    AZURE_PROVIDER_NOT_CONFIGURED: string;
    /** A region other than `'westeurope'` is a GDPR violation, not a preference. */
    AZURE_REGION_INVALID: string;
    GENERATION_FAILED: string;
  };
  BILLING: {
    PLANS_RETRIEVED: string;
    SUBSCRIPTION_RETRIEVED: string;
    CHECKOUT_SESSION_CREATED: string;
    PORTAL_SESSION_CREATED: string;
    ACTIVE_LOCATION_UPDATED: string;
    TENANT_ONLY: string;
    /** `PAYMENT_FEATURE_ENABLED` is off; gates the checkout entry point only. */
    NOT_ENABLED: string;
    PLAN_NOT_FOUND: string;
    SUBSCRIPTION_NOT_FOUND: string;
    ALREADY_SUBSCRIBED: string;
    LOCATION_LIMIT_REACHED: string;
    TEAM_MEMBER_LIMIT_REACHED: string;
    CUSTOM_PROMPTS_NOT_ON_PLAN: string;
    STRIPE_WEBHOOK_SIGNATURE_INVALID: string;
    LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION: string;
    RECEIPTS_RETRIEVED: string;
    RECEIPT_NOT_FOUND: string;
    BILLING_PROFILE_RETRIEVED: string;
    BILLING_PROFILE_UPDATED: string;
    SETUP_INTENT_CREATED: string;
    PAYMENT_METHOD_UPDATED: string;
    /** `STRIPE_SECRET_KEY` is unset on this server. */
    PAYMENT_NOT_CONFIGURED: string;
    /** Stripe could not be reached or answered with a server-side fault; transient, worth retrying. */
    PAYMENT_PROVIDER_UNAVAILABLE: string;
    SUBSCRIPTION_CANCELED: string;
    FAILED_TO_CREATE_SUBSCRIPTION: string;
    /** Should never happen: the plan row is seeded by migration. */
    FREE_PLAN_NOT_SEEDED: string;
    PAID_PLAN_NOT_SEEDED: string;
    STRIPE_WEBHOOK_TENANT_NOT_FOUND: string;
    CHECKOUT_SESSION_TENANT_MISMATCH: string;
    PAYMENT_METHOD_NOT_USABLE: string;
    CHECKOUT_RECONCILED: string;
  };
  SETTINGS: {
    BLOCKLIST_LISTED: string;
    BLOCKLIST_TERM_CREATED: string;
    BLOCKLIST_TERM_REMOVED: string;
    BLOCKLIST_TERM_EXISTS: string;
    BLOCKLIST_LIMIT_REACHED: string;
    BLOCKLIST_TERM_NOT_FOUND: string;
    TENANT_ONLY: string;
    /** Display name for a notification recipient whose user was anonymized (GDPR erasure keeps the row). */
    REMOVED_TEAM_MEMBER: string;
    RETRIEVED: string;
    UPDATED: string;
    TENANT_SETTINGS_MISSING: string;
    /** Internal invariant, unlike the public 404 `TENANT_SETTINGS_MISSING`; interpolating so the tenant id reaches the English server log while client copy stays generic (`ErrorHandlerService`). */
    TENANT_SETTINGS_ROW_MISSING: (tenantId: string) => string;
    /** Should never fire: the migration seeds the single CHECK-constrained row. */
    PLATFORM_CONFIG_MISSING: string;
    MEMBER_INVITE_SENT: string;
    MEMBER_INVITE_REVOKED: string;
    MEMBER_EMAIL_ALREADY_INVITED: string;
    MEMBER_NOT_FOUND: string;
    /** No longer `invited`; 409 not 404, since the roster entry exists. */
    MEMBER_INVITE_NOT_REVOCABLE: string;
    MEMBER_INVITES_DISABLED: string;
    /** Notification preferences are not offered while `platform_settings.notification_settings_enabled` is off. */
    NOTIFICATION_SETTINGS_DISABLED: string;
    /** `days` is the erasure grace period, so the owner knows when the data is anonymized. */
    MEMBER_REMOVAL_REQUESTED: (days: number) => string;
    MEMBER_REMOVAL_CANCELLED: string;
    /** The id exists but has no removal pending (never requested, or already past the grace
     *  period and anonymized) — 409, not 404, for the same reason `MEMBER_INVITE_NOT_REVOCABLE` is. */
    MEMBER_REMOVAL_NOT_PENDING: string;
    CANNOT_REMOVE_LAST_OWNER: string;
    /** Self-removal isn't this flow — an owner steps down or deletes their own account elsewhere. */
    CANNOT_REMOVE_SELF: string;
    NOTIFICATION_RECIPIENTS_LISTED: string;
    NOTIFICATION_RECIPIENT_UPDATED: string;
    /** The id doesn't exist, or belongs to a different tenant — same message either way, no
     *  cross-tenant enumeration. */
    NOTIFICATION_RECIPIENT_NOT_FOUND: string;
    /** `channel` and `isActive` both omitted — the caller sent nothing to change. */
    NOTIFICATION_RECIPIENT_NO_FIELDS: string;
  };
  ADMIN: {
    /** `requirePlatformAdmin`'s failure case — should never fire in practice, since every admin
     *  route is already gated by `@Roles(JwtTokenType.PLATFORM_ADMIN)`. */
    ADMIN_ONLY: string;
    USER_NOT_FOUND: string;
    USER_STATUS_UPDATED: string;
    BUSINESS_NOT_FOUND: string;
    POST_ERASURE_CHARGE_NOT_FOUND: string;
    POST_ERASURE_CHARGE_RESOLVED: string;
    BUSINESS_STATUS_UPDATED: string;
    /** Interpolates the grace-period day count (`ERASURE_GRACE_PERIOD_DAYS`). */
    BUSINESS_ERASURE_REQUESTED: (days: number) => string;
    BUSINESS_ERASURE_CANCELLED: string;
    /** `AdminBusinessesRepository.setStatus` refused — this tenant has a pending erasure request;
     *  cancel it first before changing status directly. */
    BUSINESS_ERASURE_PENDING: string;
    /** Cancelling an erasure on a business that has none pending. */
    BUSINESS_ERASURE_NOT_PENDING: string;
    /** `AdminUsersRepository.toggleActive` refused — this user has a pending team-member removal
     *  request; cancel it first before changing their status directly. */
    USER_REMOVAL_PENDING: string;
    /** The user never accepted their invite: nothing to (de)activate; the invite is revoked instead. */
    USER_INVITE_PENDING: string;
    AVATAR_UPDATED: string;
    PASSWORD_CHANGED: string;
    INVITE_SENT: string;
    INVITE_REVOKED: string;
    INVITE_NOT_FOUND: string;
    INVITE_NOT_REVOCABLE: string;
    EMAIL_ALREADY_INVITED: string;
    PLATFORM_SETTINGS_UPDATED: string;
    /** `sso`/`password`/`social` would all end up false — see `AdminSettingsService.updatePlatformSettings`'s own comment for why this is rejected outright rather than merely discouraged. */
    PLATFORM_SETTINGS_NO_METHOD_ENABLED: string;
    /** `notificationSettingsEnabled: true` is refused until email/Teams delivery exists. */
    NOTIFICATION_CHANNELS_NOT_IMPLEMENTED: string;
    /** `passwordLoginEnabled: true` is refused while no email service is set up: sign-up codes and invitations could not be delivered. */
    PASSWORD_LOGIN_NEEDS_EMAIL_SERVICE: string;
    /** Turning Microsoft or Google off while tenant users have no other way in (no password, no other provider). */
    CANNOT_DISABLE_SSO_LOGIN_SSO_ONLY_USERS: (provider: string, count: number) => string;
    /** Turning email/password off while tenant users have no other way in (a password and no single sign-on identity). */
    CANNOT_DISABLE_PASSWORD_LOGIN_PASSWORD_ONLY_USERS: (count: number) => string;
    /** The patch would leave no method that can actually be used: Microsoft and Google also need to be configured on this server. */
    PLATFORM_SETTINGS_NO_USABLE_METHOD: string;
    ADMIN_NOT_FOUND: string;
    CANNOT_DISABLE_SELF: string;
    CANNOT_DISABLE_LAST_ADMIN: string;
    /** The seeded root admin (`invited_by_platform_admin_id IS NULL`) — unlike every other admin,
     *  it has no inviter who could re-enable it if disabled, and no self-service signup exists to
     *  create a replacement. Distinct from `CANNOT_DISABLE_LAST_ADMIN`: this fires even when other
     *  admins are still active, since root being disabled is a problem in its own right, not only
     *  when it happens to be the last one standing. */
    CANNOT_DISABLE_ROOT_ADMIN: string;
    CANNOT_DISABLE_INVITED: string;
    ADMIN_DISABLED: string;
    ADMIN_ENABLED: string;
    /** `PlatformAdminRepository.createInvitedPlatformAdmin` — the insert affected no rows. */
    FAILED_TO_CREATE_INVITED_PLATFORM_ADMIN: string;
  };
  /**
   * Class-validator messages written for people (the sentence-style ones), looked up by their English text in
   * `translateValidationMessage`. Technical messages that name an API field (`pairs must contain at most 20 entries`)
   * are not translated.
   */
  VALIDATION: {
    EMAIL_INVALID: string;
    PASSWORD_REQUIRED: string;
    PASSWORD_LENGTH: string;
    PASSWORD_COMPLEXITY: string;
    OTP_REQUIRED: string;
    OTP_FORMAT: string;
    FULL_NAME_REQUIRED: string;
    FULL_NAME_LENGTH: string;
    BUSINESS_NAME_REQUIRED: string;
    BUSINESS_NAME_LENGTH: string;
    BUSINESS_NAME_CONFIRM: string;
    NAME_REQUIRED: string;
    PAYMENT_METHOD_REQUIRED: string;
    PAYMENT_METHOD_INVALID: string;
    REPLY_NEEDS_TEXT: string;
  };
  COMMON: {
    /** `ResponseUtil.success`'s default message when a controller passes none. */
    SUCCESS: string;
    /** `TransformInterceptor`'s fallback when a response reaches it with no `message` key at
     *  all (bypassing `ResponseUtil` entirely) — a defensive backstop, not the common path. */
    REQUEST_SUCCESSFUL: string;
    /** `ErrorHandlerService.handleUnhandledError`'s client-facing message in production — replaces
     *  the raw internal `Error.message` (a DB invariant, a stack-trace fragment, third-party
     *  wording) so it's never echoed to a real client. The full raw message is still logged
     *  server-side, in both environments. */
    INTERNAL_ERROR: string;
    /** The email queue refused the job, so the code or invite it carries was not sent. */
    EMAIL_QUEUE_UNAVAILABLE: string;
    /** `ErrorHandlerService`'s PostgreSQL SQLSTATE labels (`DB_*`), the SMS trial restriction and the unknown-error fallback. */
    DB_UNIQUE_VIOLATION: string;
    DB_FOREIGN_KEY_VIOLATION: string;
    DB_NOT_NULL_VIOLATION: string;
    DB_CHECK_VIOLATION: string;
    DB_EXCLUSION_VIOLATION: string;
    DB_VALUE_TOO_LONG: string;
    DB_NUMERIC_OUT_OF_RANGE: string;
    DB_INVALID_DATETIME: string;
    DB_INVALID_TEXT: string;
    DB_INVALID_CHARACTER_SEQUENCE: string;
    DB_TABLE_NOT_FOUND: string;
    DB_COLUMN_NOT_FOUND: string;
    DB_SYNTAX_ERROR: string;
    DB_SERIALIZATION_FAILURE: string;
    DB_DEADLOCK: string;
    DB_CONNECTION_FAILURE: string;
    DB_CONNECTION_UNAVAILABLE: string;
    DB_QUERY_TIMEOUT: string;
    SMS_TRIAL_RESTRICTED: string;
    UNKNOWN_ERROR: string;
  };
}
