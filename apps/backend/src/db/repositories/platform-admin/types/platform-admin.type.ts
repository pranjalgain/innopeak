import type { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import type { Locale } from '@common/i18n/locale';

export interface PlatformAdminProfileRow {
  id: string;
  email: string;
  passwordHash: string | null;
  locale: Locale | null;
}

/** Who an operational alert goes to: an active platform admin, in their own language. */
export interface PlatformAdminAlertRecipient {
  email: string;
  locale: Locale | null;
}

export interface PlatformAdminLoginRow {
  id: string;
  email: string;
  /** Null for an `invited` admin who hasn't accepted their invite/set a password yet. */
  passwordHash: string | null;
  status: PlatformAdminStatus;
  locale: Locale | null;
}

export interface PlatformAdminInviteRow {
  id: string;
  email: string;
  status: PlatformAdminStatus;
  /** Falls back to the admin's `createdAt` for the seeded root, which has no invite row. */
  invitedAt: string;
  expiresAt: string | null;
  /** `invited_by_platform_admin_id IS NULL` — the seeded root admin. */
  isRoot: boolean;
}

/**
 * Each member carries a single literal discriminant rather than a `'not_found' | 'not_invited'`
 * union: narrowing by `!== 'not_found'` would not eliminate the member, leaving `email`
 * unreachable.
 */
export type RevokeInviteOutcome =
  | { outcome: 'deleted'; id: string; email: string }
  | { outcome: 'not_found' }
  | { outcome: 'not_invited' };

/** Same reasoning as `RevokeInviteOutcome` above. */
export type SetAdminStatusOutcome =
  | { outcome: 'last_active' }
  | { outcome: 'not_found' }
  | { outcome: 'updated'; id: string; email: string; status: PlatformAdminStatus };

/**
 * `invalid` collapses every reason an invite could not be redeemed (never existed, used, expired,
 * lost a race) so a prober cannot tell which guess was closest. `identity_already_linked` (Google
 * path only) is actionable and non-enumerating, so it stays distinct.
 */
export type AcceptInviteOutcome =
  | { outcome: 'accepted'; id: string; email: string; locale: Locale | null }
  | { outcome: 'identity_already_linked' }
  | { outcome: 'invalid' };

/**
 * Linking an identity to an admin by verified email, on first use. Only an `active` admin can be linked: `invited` collapses
 * into `no_account` (an invite is redeemed through its own link), and a race on the unique identity index does too.
 */
export type LinkAdminIdentityOutcome =
  | { outcome: 'linked'; id: string; email: string; locale: Locale | null }
  | { outcome: 'no_account' }
  | { outcome: 'unavailable' };

export interface LinkAdminIdentityInput {
  provider: UserIdentityProvider;
  providerUserId: string;
  email: string;
}

export interface SetAdminStatusGuardInput {
  id: string;
  status: PlatformAdminStatus;
}

/** `PlatformAdminProfileRow` plus the avatar `MediaDbService` composes in. */
export interface PlatformAdminProfileWithAvatar extends PlatformAdminProfileRow {
  avatarUrl: string | null;
}
