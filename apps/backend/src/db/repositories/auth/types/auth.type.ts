import type { TenantStatus } from '@auth/enums/tenant-status.enum';
import type { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import type { UserRole } from '@auth/enums/user-role.enum';
import type { UserStatus } from '@auth/enums/user-status.enum';
import type { Locale } from '@common/i18n/locale';

// ─── Housekeeping ─────────────────────────────────────────────────────────────

export interface PurgeStaleTokensResult {
  /** Spent/expired `password_reset_tokens` rows across every purpose this codebase mints — see `AuthRepository.deleteStaleOtpTokens`. */
  otpTokens: number;
  refreshTokens: number;
}

// ─── Signup / tenant provisioning ─────────────────────────────────────────────

export interface SignupResult {
  tenantId: string;
  userId: string;
  status: UserStatus.PENDING_VERIFICATION;
  ownerName: string;
}

export interface SignupInput {
  businessName: string;
  ownerName: string;
  email: string; // already normalized (trimmed, lowercased) by the caller
  passwordHash: string;
  tokenHash: string;
  tokenExpiresAt: Date;
}

export interface InsertedTenant {
  id: string;
}

export interface InsertedUser {
  id: string;
}

export interface InsertTenantInput {
  name: string;
}

export interface InsertOwnerUserInput {
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string;
}

export interface InsertTenantSettingsInput {
  tenantId: string;
}

export interface InsertNotificationRecipientInput {
  tenantId: string;
  userId: string;
}

export interface InsertVerifiedOwnerUserInput {
  tenantId: string;
  name: string;
  email: string;
}

// ─── User / tenant reads & writes ─────────────────────────────────────────────

export interface UserByEmail {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  /** Null means "never chose" — see the `locale` column comment in 0002_tenant_auth.sql. */
  locale: Locale | null;
}

/** The `tenants` columns every sign-in path needs: `status` to refuse a suspended one, `name` for the token response. */
export interface TenantRow {
  status: TenantStatus;
  name: string;
}

export interface VerifiedUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string | null;
  /**
   * Carried so callers can apply the same standing checks password login does. It used to be
   * dropped here, which is how the Google callback ended up with no way to refuse a `disabled`
   * account — see AuthService.handleGoogleCallback.
   */
  status: UserStatus;
  /** Null means "never chose" — see the `locale` column comment in 0002_tenant_auth.sql. */
  locale: Locale | null;
}

export interface UserTokenHashInput {
  userId: string;
  tokenHash: string;
}

export interface VerifyEmailInput {
  email: string;
  tokenHash: string;
}

export interface UpdatePasswordInput {
  userId: string;
  passwordHash: string;
}

export interface UpdateLocaleInput {
  userId: string;
  locale: Locale;
}

export interface SetActiveLocationIdInput {
  tenantId: string;
  locationId: string | null;
}

// ─── Google identity ───────────────────────────────────────────────────────────

/**
 * `'unknown'` deliberately carries no user and no reason — what it means is an AuthService-level
 * decision (NO_ACCOUNT for a login round trip, a pending signup for a signup one), not this DB
 * service's to make. See `resolveGoogleIdentity`.
 *
 * `firstActivation` is true only on the one branch that just promoted a `pending_verification`
 * row to `active` — the Google-linking equivalent of `verifyEmail` returning non-null. It's the
 * signal `AuthService.handleGoogleCallback` uses to know "this is the moment a brand-new tenant
 * finished signing up."
 */
export type GoogleIdentityLookup =
  { kind: 'known'; user: VerifiedUser; firstActivation: boolean } | { kind: 'unknown' };

export interface InsertUserIdentityInput {
  userId: string;
  provider: UserIdentityProvider;
  providerUserId: string;
  email: string;
}

export interface UserIdentityRow {
  userId: string;
}

// ─── Verify-email / set-password OTP tokens ───────────────────────────────────

export interface PutVerifyEmailTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

// ─── Refresh tokens ────────────────────────────────────────────────────────────

export interface InsertRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

/** A refresh-token row that may or may not still be live — see `findRefreshTokenByHash`. */
export interface RefreshTokenRow {
  id: string;
  userId: string;
  /** Null while the token is still spendable; otherwise when it was rotated out or revoked. */
  revokedAt: string | null;
}

// ─── Tenant-member invites ─────────────────────────────────────────────────────

export interface InsertInvitedMemberInput {
  tenantId: string;
  email: string;
  /** `users.name` is `NOT NULL`, and the invite-send form is email-only (the invitee picks their
   *  own name on the accept screen) — the email itself is the placeholder until then, same
   *  fallback shape `AuthDbService.completeGoogleSignup` already uses (`input.name ?? input.email`). */
  name: string;
  invitedByUserId: string;
}

export interface InsertMemberInviteTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

/** Mirrors `PlatformAdminRepository.findByEmail`'s shape — global, not tenant-scoped, since
 *  `idx_users_email_active` is a global uniqueness guarantee. */
export interface MemberInviteStatusRow {
  id: string;
  tenantId: string;
  status: UserStatus;
  inviteExpiresAt: string | null;
}

export interface TenantMemberRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  invitedAt: string;
  /** Set once removal has been requested — null means no removal is pending. */
  erasureRequestedAt: string | null;
}

/**
 * Same enumeration-avoidance shape as `RevokeMemberInviteOutcome` below, plus the one guard that
 * flow doesn't need: `last_owner` refuses to strip a tenant down to zero owners. `requested` marks
 * the row `disabled` + `erasure_requested_at = now()` — the actual anonymization happens later, in
 * the nightly erasure-purge cron job, once the grace period elapses.
 */
export type RequestMemberRemovalOutcome =
  | { outcome: 'last_owner' }
  | { outcome: 'not_found' }
  | { outcome: 'requested'; id: string; email: string | null };

/** `not_pending` covers both "never requested" and "already anonymized" — either way there is
 *  nothing left for a cancel to undo. */
export type CancelMemberRemovalOutcome =
  { outcome: 'cancelled'; id: string } | { outcome: 'not_found' } | { outcome: 'not_pending' };

/**
 * The callback `AuthRepository.runWithErasurePurgeLock` hands to its `fn` for taking a further,
 * narrower per-resource session lock on the same connection the outer purge lock already holds —
 * see that method's own doc comment for why nesting locks on one connection (rather than each
 * checking out a second pooled client) is safe and necessary.
 */
export type AcquireErasureLock = <T>(
  lockKey: string,
  resourceId: string,
  fn: () => Promise<T>
) => Promise<T>;

/**
 * `invalid` covers every reason the invite couldn't be redeemed — never existed, already used,
 * expired, or lost a race between the read and the write — collapsed deliberately, same
 * enumeration-avoidance reasoning as `PlatformAdminRepository`'s own `AcceptInviteOutcome`.
 * `identity_already_linked` is Google-accept-only and IS worth telling apart — an actionable,
 * non-enumerating answer, not a guess about the token.
 */
export type AcceptMemberInviteOutcome =
  | { outcome: 'accepted'; id: string; tenantId: string; email: string; name: string }
  | { outcome: 'identity_already_linked' }
  | { outcome: 'invalid' };

/** Same three-way split as `PlatformAdminRepository.RevokeInviteOutcome`, and for the same reason
 *  — an already-accepted member is a 409 the caller can see is wrong ("already active"), not a 404
 *  indistinguishable from a typo'd id. */
export type RevokeMemberInviteOutcome =
  { outcome: 'not_found' } | { outcome: 'not_invited' } | { outcome: 'revoked'; email: string };
