import type { MessageCatalog } from './message-catalog.type';

/**
 * The English catalog — canonical content, moved here unchanged from what
 * `messages.constants.ts` held directly before this file existed. `messages.constants.ts` now
 * re-exports `MESSAGES`, built from this catalog by `message-registry.ts`; every existing call
 * site (`MESSAGES.AUTH.INVALID_CREDENTIALS`, etc.) is unaffected by that split.
 */
export const messagesEn: MessageCatalog = {
  AUTH: {
    SIGNUP_OTP_SENT: (email: string): string => `Verification code sent to ${email}`,
    LOGIN_OTP_SENT: (email: string): string => `Verification code sent to ${email}`,
    // Deliberately the same message whether or not this email actually matches a
    // pending_verification account — see Security considerations (no enumeration).
    RESEND_OTP_ACK: 'If this account is awaiting verification, a code has been sent.',
    EMAIL_VERIFIED: 'Email verified.',
    EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
    // Deliberately the same message whether the code never existed, was already used, or is
    // expired — see the auth API reference's Security considerations (no enumeration).
    INVALID_OR_EXPIRED_OTP: 'Invalid or expired verification code.',
    // Says "too many attempts" without saying whether the email matches an account — the counter
    // is keyed on the submitted address either way, so this leaks nothing an attacker can use.
    TOO_MANY_OTP_ATTEMPTS:
      'Too many verification attempts. Request a new code and try again shortly.',
    // Deliberately the same message for a wrong password, an unknown email, and an SSO-only
    // account attempting password login — see Security considerations.
    INVALID_CREDENTIALS: 'Invalid email or password.',
    ACCOUNT_DISABLED: 'This account has been disabled.',
    TENANT_SUSPENDED: 'This account is currently suspended.',
    INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token.',
    INVALID_ACCESS_TOKEN: 'Invalid or expired access token.',
    LOGGED_OUT: 'Logged out.',
    INVALID_CURRENT_PASSWORD: 'Current password is incorrect.',
    NO_PASSWORD_SET:
      'This account has no password. Sign in with the identity provider used to create it.',
    PASSWORD_ALREADY_SET: 'This account already has a password. Use change password instead.',
    // "Signing out" rather than "signed out": the change revokes every other refresh token
    // immediately, but an access token already issued elsewhere stays valid until it expires (up
    // to 15 minutes). Claiming the sessions are already gone overstates what happened.
    PASSWORD_CHANGED: 'Password changed. Other sessions are being signed out.',
    PASSWORD_SET: 'Password set. You can now sign in with a password too.',
    // Same enumeration-shape reasoning as RESEND_OTP_ACK: the caller is already authenticated, so
    // this doesn't need to hide whether the account exists, but it does hide whether a code was
    // actually re-sent or the previous one is still live within its cooldown.
    SET_PASSWORD_OTP_ACK: 'Verification code sent. Check your email to continue.',
    LOCALE_UPDATED: 'Language preference updated.',
    AVATAR_UPDATED: 'Avatar updated.',
    TENANT_ONLY: 'This action is only available to tenant users.',
    // Thrown by requireTenantUser() when a platform-admin token reaches a tenant-scoped route.
    // Says "not available" rather than "you are a platform admin" — the caller already knows what
    // it authenticated as, and naming the token type in the response tells an attacker which
    // half of the token space they landed in.
    GOOGLE_NOT_CONFIGURED:
      'Google sign-in is not configured on this server. Contact support or use email and password.',
    // Missing, expired, already-consumed, or the visitor never went through the Google callback.
    GOOGLE_PENDING_SIGNUP_EXPIRED:
      'This signup has expired. Start again with "Continue with Google".',
    TENANT_CONTEXT_REQUIRED: 'This endpoint is not available for this account type.',
    // Deliberately the same message whether the token never existed, was already used, or is
    // expired — see the auth API reference's Security considerations (no enumeration).
    INVALID_OR_EXPIRED_INVITE: 'This invite link is invalid or has expired.',
    INVITE_ACCEPTED: "Invite accepted. You're signed in.",
  },
  MEDIA: {
    UPLOAD_NOT_VERIFIED: 'Could not verify the uploaded image.',
    UNSUPPORTED_FORMAT:
      'This image format is not supported. Please upload a JPG, PNG, WEBP, GIF, AVIF, HEIC, or BMP file.',
    FILE_TOO_LARGE: 'That image is too large. Please upload a file under 10 MB.',
  },
  CONNECTIONS: {
    CONNECTION_NOT_FOUND: 'No Google Business Profile connection found for this account.',
    // Deliberately the same message whether the location belongs to no one or to another tenant —
    // a distinct "forbidden" would confirm the id exists somewhere, which is a tenant-enumeration
    // oracle. The status code is 404 in both cases for the same reason.
    LOCATION_NOT_FOUND: 'Location not found.',
    EXTERNAL_LOCATION_NOT_FOUND:
      'That location is not visible to the connected Google account. Reconnect and try again.',
    CONNECTION_NEEDS_REAUTH:
      'The Google connection has expired. Reconnect your Google Business Profile to continue.',
    LOCATION_LIMIT_REACHED: 'Too many locations for this account.',
    BACKFILL_ENQUEUE_FAILED:
      'Location connected, but the review import could not be started. Please try confirming this location again.',
    PROVIDER_UNAVAILABLE: 'Google Business Profile is unavailable right now. Please try again.',
    PROVIDER_NOT_CONFIGURED:
      'Google Business Profile is not configured on this server. Contact support.',
    DISCONNECTED: 'Google Business Profile disconnected.',
    LOCATION_CONFIRMED: 'Location connected. Importing your review history.',
    LOCATION_INACTIVE: 'This location is disconnected and cannot be selected.',
    ACTIVE_LOCATION_UPDATED: 'Active location updated.',
  },
  DASHBOARD: {
    TENANT_ONLY: 'Dashboard analytics are only available to tenant users.',
  },
  REVIEWS: {
    REVIEW_NOT_FOUND: 'Review not found.',
    TENANT_ONLY: 'Reviews are only available to tenant users.',
  },
  PROMPTS: {
    LISTED: 'Prompts retrieved successfully',
    VERSION_CREATED: 'Prompt version created successfully',
    TONE_UPDATED: 'Prompt tone updated successfully',
    NOT_FOUND: 'Prompt not found',
    TEMPLATE_UNCHANGED: 'Template is identical to the current version',
    VERSION_CONFLICT: 'Another version was saved at the same time — retry after reloading',
    UNKNOWN_VARIABLE: (names: readonly string[]): string =>
      `Unknown prompt placeholder(s): ${names.join(', ')}`,
    MISSING_VARIABLE: (names: readonly string[]): string =>
      `Missing required prompt placeholder(s): ${names.join(', ')}`,
    TENANT_ONLY: 'Prompts are only available to tenant users.',
  },
  SETTINGS: {
    BLOCKLIST_LISTED: 'Blocklist terms retrieved successfully',
    BLOCKLIST_TERM_CREATED: 'Blocklist term added',
    BLOCKLIST_TERM_REMOVED: 'Blocklist term removed',
    BLOCKLIST_TERM_EXISTS: 'This term is already on the blocklist',
    BLOCKLIST_TERM_NOT_FOUND: 'Blocklist term not found',
    TENANT_ONLY: 'Settings are only available to tenant users.',
    RETRIEVED: 'Settings retrieved successfully',
    UPDATED: 'Settings updated',
    TENANT_SETTINGS_MISSING: 'Tenant settings were not provisioned for this account',
    PLATFORM_CONFIG_MISSING: 'Platform settings are not configured.',
    MEMBER_INVITE_SENT: 'Invite sent.',
    MEMBER_INVITE_REVOKED: 'Invite revoked.',
    MEMBER_EMAIL_ALREADY_INVITED: 'This email already has a pending invite.',
    MEMBER_NOT_FOUND: 'Team member not found.',
    MEMBER_INVITE_NOT_REVOCABLE: 'This invite has already been accepted or is no longer pending.',
    MEMBER_INVITES_DISABLED: 'Inviting team members is turned off for this platform.',
  },
  ADMIN: {
    ADMIN_ONLY: 'Only a platform admin may perform this action.',
    USER_NOT_FOUND: 'User not found.',
    USER_STATUS_UPDATED: 'User status updated.',
    BUSINESS_NOT_FOUND: 'Business not found.',
    BUSINESS_STATUS_UPDATED: 'Business status updated.',
    AVATAR_UPDATED: 'Avatar updated.',
    PASSWORD_CHANGED: 'Password changed.',
    INVITE_SENT: 'Invite sent.',
    INVITE_REVOKED: 'Invite revoked.',
    INVITE_NOT_FOUND: 'Invite not found.',
    INVITE_NOT_REVOCABLE: 'This invite has already been accepted or is no longer pending.',
    EMAIL_ALREADY_INVITED: 'This email is already a platform admin or has a pending invite.',
    PLATFORM_SETTINGS_UPDATED: 'Platform settings updated.',
    PLATFORM_SETTINGS_NO_METHOD_ENABLED:
      'At least one sign-in method (SSO, email/password, or Google) must stay enabled.',
    CANNOT_DISABLE_SOCIAL_LOGIN_GOOGLE_ONLY_ADMIN: (count: number): string => {
      const who = count === 1 ? 'one of your platform admins' : `${count} of your platform admins`;
      const target = count === 1 ? 'that admin' : 'those admins';
      return `Google is the only way ${who} can sign in, so turning it off would lock them out. Disable ${target} first if that is intended.`;
    },
    ADMIN_NOT_FOUND: 'Platform admin not found.',
    CANNOT_DISABLE_SELF: 'You cannot disable your own admin account.',
    CANNOT_DISABLE_LAST_ADMIN: 'At least one platform admin must stay active.',
    CANNOT_DISABLE_INVITED:
      'This admin has not accepted their invite yet — revoke the invite instead.',
    ADMIN_DISABLED: 'Admin disabled.',
    ADMIN_ENABLED: 'Admin enabled.',
  },
  COMMON: {
    SUCCESS: 'Success',
    REQUEST_SUCCESSFUL: 'Request successful',
  },
};
