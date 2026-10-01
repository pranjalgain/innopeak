import type { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { Locale } from '@common/i18n/locale';

// ─── PlatformAdminRepository ─────────────────────────────────────────────────

export interface PlatformAdminProfileRow {
  id: string;
  email: string;
  passwordHash: string | null;
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
  /** Falls back to the admin's own `createdAt` for the seeded root admin, which has no invite row
   * at all — see `PlatformAdminDbService.listInvites`. */
  invitedAt: string;
  expiresAt: string | null;
  /** `invited_by_platform_admin_id IS NULL` — the seeded root admin. */
  isRoot: boolean;
}

/**
 * Each member carries a single literal discriminant rather than one member with a
 * `'not_found' | 'not_invited'` union: narrowing by `!== 'not_found'` only subtracts that literal
 * from such a member's property type, it never eliminates the member, so the `deleted` branch
 * stays unnarrowed and `email` is unreachable at every call site.
 */
export type RevokeInviteOutcome =
  | { outcome: 'deleted'; id: string; email: string }
  | { outcome: 'not_found' }
  | { outcome: 'not_invited' };

/** Same reasoning as `RevokeInviteOutcome` above — see `setStatusGuardingLastActive`. */
export type SetAdminStatusOutcome =
  | { outcome: 'last_active' }
  | { outcome: 'not_found' }
  | { outcome: 'updated'; id: string; email: string; status: PlatformAdminStatus };

/**
 * `invalid` covers every reason the invite couldn't be redeemed — never existed, already used,
 * expired, or lost a race between the read and the write below — collapsed into one outcome
 * deliberately: distinguishing them to the caller would tell a prober which guess was closest, the
 * same enumeration-avoidance reasoning as `MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP`.
 *
 * `identity_already_linked` is `acceptInviteWithGoogleIdentity`-only and IS worth telling apart —
 * it's an actionable, non-enumerating answer ("this Google account is already someone else's"),
 * not a guess about the token.
 */
export type AcceptInviteOutcome =
  | { outcome: 'accepted'; id: string; email: string; locale: Locale | null }
  | { outcome: 'identity_already_linked' }
  | { outcome: 'invalid' };

export interface SetAdminStatusGuardInput {
  id: string;
  status: PlatformAdminStatus;
}

// ─── PlatformAdminDbService ──────────────────────────────────────────────────

/** `PlatformAdminProfileRow` plus the avatar `MediaDbService` composes in — see `findById`. */
export interface PlatformAdminProfileWithAvatar extends PlatformAdminProfileRow {
  avatarUrl: string | null;
}
