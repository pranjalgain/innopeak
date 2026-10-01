/**
 * The shared shape both `messages.en.ts` and `messages.de.ts` are typed against. Deliberately an
 * explicit interface, not `typeof messagesEn`: typing `messagesDe: MessageCatalog = {...}` against
 * an interface makes a missing key, an extra key, or a mismatched interpolating-function signature
 * a compile error in the German file itself — the property the multilingual design doc asks for
 * ("a missing or extra German key is a compile error rather than a runtime fallback"). Typing it
 * against `typeof messagesEn` instead would need `messagesEn`'s literal string types widened
 * everywhere first, and would point the error at the wrong file besides.
 */
export interface MessageCatalog {
  AUTH: {
    SIGNUP_OTP_SENT: (email: string) => string;
    LOGIN_OTP_SENT: (email: string) => string;
    RESEND_OTP_ACK: string;
    EMAIL_VERIFIED: string;
    EMAIL_ALREADY_REGISTERED: string;
    INVALID_OR_EXPIRED_OTP: string;
    TOO_MANY_OTP_ATTEMPTS: string;
    INVALID_CREDENTIALS: string;
    ACCOUNT_DISABLED: string;
    TENANT_SUSPENDED: string;
    INVALID_REFRESH_TOKEN: string;
    INVALID_ACCESS_TOKEN: string;
    LOGGED_OUT: string;
    INVALID_CURRENT_PASSWORD: string;
    NO_PASSWORD_SET: string;
    PASSWORD_ALREADY_SET: string;
    PASSWORD_CHANGED: string;
    PASSWORD_SET: string;
    SET_PASSWORD_OTP_ACK: string;
    LOCALE_UPDATED: string;
    AVATAR_UPDATED: string;
    TENANT_ONLY: string;
    GOOGLE_NOT_CONFIGURED: string;
    GOOGLE_PENDING_SIGNUP_EXPIRED: string;
    TENANT_CONTEXT_REQUIRED: string;
    /** Same message for a token that never existed, was already used, or has expired — see
     *  Security considerations (no enumeration). Covers the password and Google accept paths for
     *  both the platform-admin and tenant-member invite flows — the same generic wording applies
     *  to either. */
    INVALID_OR_EXPIRED_INVITE: string;
    /** Shared by `PlatformAdminAuthService.acceptAdminInvite` and `AuthService.acceptMemberInvite`. */
    INVITE_ACCEPTED: string;
    /** `AuthRepository.createTenant` — the insert affected no rows. Should never happen (no
     *  conflicting unique constraint on this path); a should-never-happen invariant guard. */
    FAILED_TO_CREATE_TENANT: string;
    /** `AuthRepository.createUser`/`createUserWithGoogleIdentity` — the insert affected no rows.
     *  Same should-never-happen shape as `FAILED_TO_CREATE_TENANT`. */
    FAILED_TO_CREATE_USER: string;
    /** `AuthRepository.createInvitedMember` — the insert affected no rows. */
    FAILED_TO_CREATE_INVITED_MEMBER: string;
  };
  MEDIA: {
    /** `StorageProvider.verifyUpload` returned `{ ok: false, reason: 'notFound' }` — the confirmed
     *  asset doesn't exist, or isn't in the expected folder. Deliberately generic: the specific
     *  reason is logged server-side, not handed to the client, since either is equally likely to
     *  be a client bug or someone probing the confirm endpoint with a made-up id. */
    UPLOAD_NOT_VERIFIED: string;
    /** `StorageProvider.verifyUpload` returned `{ ok: false, reason: 'unsupportedFormat' }` — a
     *  real, freshly-uploaded asset whose format this app just doesn't persist avatars as. Safe to
     *  name specifically (unlike `UPLOAD_NOT_VERIFIED`): reaching this branch already requires a
     *  real asset the caller itself just uploaded through its own signed authorization, so this
     *  tells a legitimate user something actionable rather than helping anyone probe for valid ids. */
    UNSUPPORTED_FORMAT: string;
    /** `StorageProvider.verifyUpload` returned `{ ok: false, reason: 'tooLarge' }` — a real,
     *  in-folder asset that exceeds the size cap. Safe to name specifically for the same reason as
     *  `UNSUPPORTED_FORMAT`, and just as actionable: the fix is a smaller file. */
    FILE_TOO_LARGE: string;
    /** `MediaRepository.persistAvatar` — the upsert affected no rows. */
    FAILED_TO_PERSIST_AVATAR: string;
  };
  NOTIFICATIONS: {
    LISTED: string;
    NOT_FOUND: string;
    MARKED_READ: string;
    MARKED_ALL_READ: string;
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
    DISCONNECTED: string;
    LOCATION_CONFIRMED: string;
    LOCATION_INACTIVE: string;
    ACTIVE_LOCATION_UPDATED: string;
    /** `ConnectionsRepository.upsertConnection` — the upsert affected no rows. */
    FAILED_TO_UPSERT_CONNECTION: string;
    /** `ConnectionsRepository.upsertLocation` — the upsert affected no rows. */
    FAILED_TO_UPSERT_LOCATION: string;
  };
  DASHBOARD: {
    TENANT_ONLY: string;
  };
  REVIEWS: {
    REVIEW_NOT_FOUND: string;
    TENANT_ONLY: string;
    /** `ReviewSyncRepository.acquireSyncRun` — the insert affected no rows. */
    FAILED_TO_ACQUIRE_SYNC_RUN: string;
    /** `ReviewSyncRepository.upsertReview` — the upsert affected no rows. */
    FAILED_TO_UPSERT_REVIEW: string;
    /** `ReviewSyncRepository.insertGeneratedResponse` — the insert affected no rows for the given
     *  review. Kept as an interpolating entry (unlike the other should-never-happen guards in this
     *  batch) so the specific review id survives into the English-rendered server log even though
     *  the client-facing copy is generic in production — see `ErrorHandlerService`. */
    GENERATED_RESPONSE_INSERT_FAILED: (reviewId: string) => string;
    /** `ReviewsService.approveReply`/`rejectReply` — the response id/reviewId/tenantId combination
     *  doesn't resolve to a real row. */
    RESPONSE_NOT_FOUND: string;
    /** The response exists but isn't `pending_approval` (already decided, or raced away by a
     *  sibling's approval) — a 409, not a 404, since the row is plainly still there. */
    RESPONSE_NOT_ACTIONABLE: string;
    /** `idx_review_responses_review_id_live_reply` — this review already has an `approved`/`posted`
     *  response; a sibling won the same race a moment earlier. */
    RESPONSE_ALREADY_LIVE: string;
    RESPONSE_APPROVED: string;
    RESPONSE_REJECTED: string;
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
    TENANT_ONLY: string;
    DRY_RUN_GENERATED: string;
    /** Every tenant is seeded with all three prompt categories at signup
     *  (`PromptsDbService.insertDefaultsForTenant`), so this is a data-integrity fallback, not an
     *  expected path — see `AiReplyGenerationService.resolvePrompt`. */
    PROMPT_NOT_CONFIGURED: string;
    /** `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` unset — checked lazily on first call, not at boot.
     *  See `OpenRouterAiProvider`'s own doc comment for why. */
    PROVIDER_NOT_CONFIGURED: string;
    GENERATION_FAILED: string;
  };
  BILLING: {
    PLANS_RETRIEVED: string;
    SUBSCRIPTION_RETRIEVED: string;
    CHECKOUT_SESSION_CREATED: string;
    PORTAL_SESSION_CREATED: string;
    ACTIVE_LOCATION_UPDATED: string;
    TENANT_ONLY: string;
    /** The deploy-level `PAYMENT_FEATURE_ENABLED` switch is off — gates the *entry point* only
     *  (`POST /v1/billing/checkout`); an already-subscribed tenant's existing billing is
     *  unaffected. See `env.config.ts`'s own doc comment on that env var. */
    NOT_ENABLED: string;
    PLAN_NOT_FOUND: string;
    SUBSCRIPTION_NOT_FOUND: string;
    /** `POST /v1/billing/checkout` called while the tenant already has a live Stripe subscription
     *  — see `AlreadySubscribedException`. */
    ALREADY_SUBSCRIBED: string;
    LOCATION_LIMIT_REACHED: string;
    TEAM_MEMBER_LIMIT_REACHED: string;
    CUSTOM_PROMPTS_NOT_ON_PLAN: string;
    /** `BillingEntitlementsService.canGenerateAiDraft` — genuinely enforced now:
     *  `AiReplyGenerationService.generateForClassifiedReviews` (wired into the 15-minute review-sync
     *  poll) persists an `ai_generated` draft on every success, which is exactly what this count
     *  tracks (see that method's own doc comment). */
    AI_DRAFT_LIMIT_REACHED: string;
    STRIPE_WEBHOOK_SIGNATURE_INVALID: string;
    /** `PUT /v1/billing/active-location` named a location that isn't this tenant's own, or is
     *  `status = 'inactive'` (disconnected). */
    LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION: string;
    /** `POST /v1/billing/dummy/*` called while `PAYMENT_PROVIDER=stripe`. */
    DUMMY_PROVIDER_NOT_ACTIVE: string;
    RECEIPTS_RETRIEVED: string;
    /** `GET /v1/billing/receipts/:id/pdf` (or the list) named a receipt that isn't this tenant's
     *  own, or doesn't exist. */
    RECEIPT_NOT_FOUND: string;
    BILLING_PROFILE_RETRIEVED: string;
    BILLING_PROFILE_UPDATED: string;
    SETUP_INTENT_CREATED: string;
    PAYMENT_METHOD_UPDATED: string;
    /** In-app card/billing-profile editing is Stripe-only — see `StripeOnlyFeatureException`. */
    STRIPE_ONLY_FEATURE: string;
    CHECKOUT_COMPLETED: string;
    SUBSCRIPTION_CANCELED: string;
    /** `TenantSubscriptionsRepository.createSubscription` — the insert affected no rows. */
    FAILED_TO_CREATE_SUBSCRIPTION: string;
    /** `TenantSubscriptionsDbService` — the `free` billing plan row is missing from
     *  `billing_plans`. Should never happen: that row is seeded by migration. */
    FREE_PLAN_NOT_SEEDED: string;
    /** Same should-never-happen shape as `FREE_PLAN_NOT_SEEDED`, for the `paid` plan row. */
    PAID_PLAN_NOT_SEEDED: string;
  };
  SETTINGS: {
    BLOCKLIST_LISTED: string;
    BLOCKLIST_TERM_CREATED: string;
    BLOCKLIST_TERM_REMOVED: string;
    BLOCKLIST_TERM_EXISTS: string;
    BLOCKLIST_TERM_NOT_FOUND: string;
    TENANT_ONLY: string;
    RETRIEVED: string;
    UPDATED: string;
    TENANT_SETTINGS_MISSING: string;
    /** `ReviewPipelineDbService` — no `tenant_settings` row for the given tenant. Distinct from
     *  `TENANT_SETTINGS_MISSING` (that one is `TenantSettingsMissingException`'s public 404
     *  wording for a settings-read call): this is an internal should-never-happen invariant, kept
     *  as an interpolating entry so the specific tenant id survives into the English-rendered
     *  server log even though the client-facing copy is generic in production — see
     *  `ErrorHandlerService`. */
    TENANT_SETTINGS_ROW_MISSING: (tenantId: string) => string;
    /** Should never fire in practice — the migration seeds `platform_settings` unconditionally
     *  and its id is CHECK-constrained to exactly 1 row. */
    PLATFORM_CONFIG_MISSING: string;
    MEMBER_INVITE_SENT: string;
    MEMBER_INVITE_REVOKED: string;
    /** A live, unexpired invite already exists for this email in this tenant. */
    MEMBER_EMAIL_ALREADY_INVITED: string;
    MEMBER_NOT_FOUND: string;
    /** The id exists but is no longer `invited` (already accepted, or never was) — a 409, not a 404, since the roster entry is plainly still there. */
    MEMBER_INVITE_NOT_REVOCABLE: string;
    /** `platform_settings.invite_members_enabled` is off. */
    MEMBER_INVITES_DISABLED: string;
    /** Interpolates the grace-period day count (`ERASURE_GRACE_PERIOD_DAYS`) so the owner knows
     *  exactly when the member's data is actually anonymized. */
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
    BUSINESS_STATUS_UPDATED: string;
    /** Interpolates the grace-period day count (`ERASURE_GRACE_PERIOD_DAYS`). */
    BUSINESS_ERASURE_REQUESTED: (days: number) => string;
    BUSINESS_ERASURE_CANCELLED: string;
    /** `AdminBusinessesRepository.setStatus` refused — this tenant has a pending erasure request;
     *  cancel it first before changing status directly. */
    BUSINESS_ERASURE_PENDING: string;
    /** `AdminUsersRepository.toggleActive` refused — this user has a pending team-member removal
     *  request; cancel it first before changing their status directly. */
    USER_REMOVAL_PENDING: string;
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
    /** Turning off Google sign-in would strand admins who have no password — same
     *  lockout-prevention family as `CANNOT_DISABLE_LAST_ADMIN`. */
    CANNOT_DISABLE_SOCIAL_LOGIN_GOOGLE_ONLY_ADMIN: (count: number) => string;
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
  };
}

/** Every leaf key path this catalog exposes, as `'AUTH.INVALID_CREDENTIALS'`-style dotted
 *  strings — generated from `MessageCatalog` so a renamed/added/removed key can't drift out of
 *  sync with the type it's derived from. */
export type MessageCatalogPath = PathsOf<MessageCatalog>;

type PathsOf<T, Prefix extends string = ''> = {
  [K in string & keyof T]: T[K] extends (...args: never[]) => string
    ? `${Prefix}${K}`
    : T[K] extends string
      ? `${Prefix}${K}`
      : PathsOf<T[K], `${Prefix}${K}.`>;
}[string & keyof T];
