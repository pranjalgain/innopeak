import type { TenantStatus } from '@auth/enums/tenant-status.enum';
import type { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import type { UserRole } from '@auth/enums/user-role.enum';
import type { UserStatus } from '@auth/enums/user-status.enum';
import type { Locale } from '@common/i18n/locale';

export interface PurgeStaleTokensResult {
  /**
   * Spent/expired `user_auth_tokens` rows across every purpose (see
   * `AuthRepository.deleteStaleOtpTokens`).
   */
  otpTokens: number;
  refreshTokens: number;
  /** Sign-ups nobody verified within `PENDING_SIGNUP_PURGE_AFTER_HOURS`, removed with their tenant. */
  pendingSignups: number;
}

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

export interface UserByEmail {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  /** Null means "never chose". */
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
   * Carried so callers can apply the same standing checks as password login (e.g. refusing a
   * `disabled` account in the Google callback).
   */
  status: UserStatus;
  /** Null means "never chose". */
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

/**
 * `'unknown'` carries no user or reason: what it means is an AuthService decision (NO_ACCOUNT on
 * login, a pending signup on signup). `firstActivation` is true only when this call just promoted a
 * `pending_verification` row to `active`, the moment a brand-new tenant finished signing up.
 */
export type SsoIdentityLookup =
  { kind: 'known'; user: VerifiedUser; firstActivation: boolean } | { kind: 'unknown' };

/** What linking by email can answer: `invited` means the address belongs to a pending team invite, which only the invite link may accept. */
export type SsoEmailLinkResult = SsoIdentityLookup | { kind: 'invited' };

export interface InsertUserIdentityInput {
  userId: string;
  provider: UserIdentityProvider;
  providerUserId: string;
  email: string;
}

export interface UserIdentityRow {
  userId: string;
}

export interface PutVerifyEmailTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

export interface InsertRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

/** May or may not still be live; see `findRefreshTokenByHash`. */
export interface RefreshTokenRow {
  id: string;
  userId: string;
  /** Null while the token is still spendable; otherwise when it was rotated out or revoked. */
  revokedAt: string | null;
  /**
   * True when the row was revoked by rotation (its replacement was created in the same transaction, so it carries the same
   * timestamp); false for one revoked by a sign-out, a password change or an account standing check. Only the former can be a leaked,
   * replayed token.
   */
  rotated: boolean;
}

export interface InsertInvitedMemberInput {
  tenantId: string;
  email: string;
  /**
   * `users.name` is `NOT NULL` and the invite form is email-only (the invitee picks a name on
   * accept), so the email is the placeholder until then.
   */
  name: string;
  invitedByUserId: string;
}

export interface InsertMemberInviteTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}

/** Global, not tenant-scoped, since `idx_users_email_active` is a global uniqueness guarantee. */
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
 * Same enumeration-avoidance shape as `RevokeMemberInviteOutcome`, plus `last_owner`, which refuses
 * to strip a tenant down to zero owners. `requested` only marks the row; anonymization happens
 * later in the nightly purge.
 */
export type RequestMemberRemovalOutcome =
  | { outcome: 'last_owner' }
  | { outcome: 'not_found' }
  | { outcome: 'requested'; id: string; email: string | null };

/**
 * `not_pending` covers both "never requested" and "already anonymized": nothing is left to cancel.
 */
export type CancelMemberRemovalOutcome =
  { outcome: 'cancelled'; id: string } | { outcome: 'not_found' } | { outcome: 'not_pending' };

/**
 * Callback `runWithErasurePurgeLock` hands to `fn` for taking narrower per-resource session locks
 * on the connection that already holds the outer purge lock.
 */
export type AcquireErasureLock = <T>(
  lockKey: string,
  resourceId: string,
  fn: () => Promise<T>
) => Promise<T>;

/**
 * `invalid` collapses every reason the invite can't be redeemed (never existed, used, expired, lost
 * a race) to avoid enumeration. `identity_already_linked` is Google-accept-only and is worth
 * telling apart: it is actionable without revealing anything about the token.
 */
export type AcceptMemberInviteOutcome =
  | { outcome: 'accepted'; id: string; tenantId: string; email: string; name: string }
  | { outcome: 'identity_already_linked' }
  | { outcome: 'invalid' };

/**
 * Same three-way split as `PlatformAdminRepository.RevokeInviteOutcome`: an already-accepted member
 * is a 409 the caller can see is wrong, not a 404 indistinguishable from a typo'd id.
 */
export type RevokeMemberInviteOutcome =
  { outcome: 'not_found' } | { outcome: 'not_invited' } | { outcome: 'revoked'; email: string };

/** Who an erasure email goes to: an active owner, in their own language (null = never chose one). */
export interface ErasureNoticeRecipient {
  userId: string;
  /** Whether they can restore with a password — an SSO-only owner cannot. */
  hasPassword: boolean;
  email: string;
  name: string;
  locale: Locale | null;
}

/** A tenant whose pending erasure is close enough to its deadline for the "N days left" reminder. */
export interface ErasureReminderCandidate {
  id: string;
}
