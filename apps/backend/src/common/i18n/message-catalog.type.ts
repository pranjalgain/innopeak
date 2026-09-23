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
  };
  DASHBOARD: {
    TENANT_ONLY: string;
  };
  REVIEWS: {
    REVIEW_NOT_FOUND: string;
    TENANT_ONLY: string;
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
  };
  COMMON: {
    /** `ResponseUtil.success`'s default message when a controller passes none. */
    SUCCESS: string;
    /** `TransformInterceptor`'s fallback when a response reaches it with no `message` key at
     *  all (bypassing `ResponseUtil` entirely) — a defensive backstop, not the common path. */
    REQUEST_SUCCESSFUL: string;
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
