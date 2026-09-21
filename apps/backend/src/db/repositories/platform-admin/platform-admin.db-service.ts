import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { Locale } from '@common/i18n/locale';
import { MediaDbService } from '@db/repositories/media/media.db-service';
import { Injectable } from '@nestjs/common';

import {
  type AcceptInviteOutcome,
  type PlatformAdminInviteRow,
  type PlatformAdminLoginRow,
  type PlatformAdminProfileRow,
  PlatformAdminRepository,
  type RevokeInviteOutcome,
  type SetAdminStatusGuardInput,
  type SetAdminStatusOutcome,
} from './platform-admin.repository';

/** `PlatformAdminProfileRow` plus the avatar `MediaDbService` composes in — see `findById`. */
export interface PlatformAdminProfileWithAvatar extends PlatformAdminProfileRow {
  avatarUrl: string | null;
}

@Injectable()
export class PlatformAdminDbService {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly mediaDbService: MediaDbService
  ) {}

  /**
   * The profile row plus its avatar, composed from two repositories rather than a join in
   * `PlatformAdminRepository` itself — `platform_admins` has no `avatar_url` column at all
   * anymore (see `0001_platform_admin.sql`'s own header), so "this admin's profile" is inherently
   * two reads now, and composing them is exactly a DB Service's job.
   */
  async findById(id: string): Promise<PlatformAdminProfileWithAvatar | null> {
    const row = await this.platformAdminRepository.findById(id);
    if (!row) return null;

    const avatarUrl = await this.mediaDbService.findAvatarUrl({ platformAdminId: id });
    return { ...row, avatarUrl };
  }

  /** See `PlatformAdminRepository.findForLogin` — the read `PlatformAdminAuthService.login` uses. */
  async findForLogin(email: string): Promise<PlatformAdminLoginRow | null> {
    return this.platformAdminRepository.findForLogin(email);
  }

  /** Live status of an admin by id, `null` if the row is gone — see `PlatformAdminRepository.findStatusById`. */
  async findStatusById(id: string): Promise<PlatformAdminStatus | null> {
    return this.platformAdminRepository.findStatusById(id);
  }

  /** See `PlatformAdminRepository.isRootAdmin`. */
  async isRootAdmin(id: string): Promise<boolean> {
    return this.platformAdminRepository.isRootAdmin(id);
  }

  /** Issues (or reissues) the OTP `AdminSettingsService.setPassword` requires before a
   *  passwordless admin can adopt one — see `PlatformAdminRepository.putSetPasswordOtp`. */
  async putSetPasswordOtp(input: {
    platformAdminId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<void> {
    await this.platformAdminRepository.transaction(tx =>
      this.platformAdminRepository.putSetPasswordOtp(tx, input)
    );
  }

  /** CAS-consumes the admin set-password OTP; true only if it matched, was unused, and hadn't expired. */
  async consumeSetPasswordOtp(input: {
    platformAdminId: string;
    tokenHash: string;
  }): Promise<boolean> {
    return this.platformAdminRepository.transaction(tx =>
      this.platformAdminRepository.consumeSetPasswordOtp(tx, input)
    );
  }

  /** See `PlatformAdminRepository.setStatusGuardingLastActive` — the actual last-active-admin guard lives there, atomically. */
  async setStatusGuardingLastActive(
    input: SetAdminStatusGuardInput
  ): Promise<SetAdminStatusOutcome> {
    return this.platformAdminRepository.setStatusGuardingLastActive(input);
  }

  async findByEmail(
    email: string
  ): Promise<{ id: string; status: PlatformAdminStatus; inviteExpiresAt: string | null } | null> {
    return this.platformAdminRepository.findByEmail(email);
  }

  /** See `PlatformAdminRepository.deleteExpiredInvite` — clears a lapsed invite so its address can be reused. */
  async deleteExpiredInvite(id: string): Promise<void> {
    return this.platformAdminRepository.deleteExpiredInvite(id);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.platformAdminRepository.updatePasswordHash(id, passwordHash);
  }

  /** See `PlatformAdminRepository.updateLocale`. Re-fetches via this class's own `findById` (not
   *  the repository's) so the fresh row still carries its avatar — the caller returns this
   *  straight to the client as the updated profile, same as every other mutation here. */
  async updateLocale(id: string, locale: Locale): Promise<PlatformAdminProfileWithAvatar | null> {
    await this.platformAdminRepository.updateLocale(id, locale);
    return this.findById(id);
  }

  /**
   * Every platform admin — this is the roster behind Settings → Members, not just pending
   * invites, despite the name. `invitedAt` falls back to the admin's own `createdAt` for the
   * seeded root, which has no invite row at all (see the repository's own comment).
   *
   * `expiresAt` stays **null** for such a row rather than falling back to `createdAt`. The
   * fallback invented an expiry that was never real — the root admin came back claiming to have
   * expired the instant it was seeded — and it only looked harmless because the UI happens to
   * branch on `status`. A field that means "when this invite lapses" has no honest value for a
   * row that was never invited, so it says so.
   */
  async listInvites(): Promise<PlatformAdminInviteRow[]> {
    const rows = await this.platformAdminRepository.findAllWithInvites();
    return rows.map(row => ({
      id: row.id,
      email: row.email,
      status: row.status,
      invitedAt: row.inviteCreatedAt ?? row.createdAt,
      expiresAt: row.inviteExpiresAt,
      isRoot: row.invitedByPlatformAdminId === null,
    }));
  }

  /** Both inserts (the admin's own row, then its invite token row) happen in one transaction — a
   * failure between the two must not leave an invited-status admin with no invite ever recorded. */
  async createInvite(input: {
    email: string;
    invitedByPlatformAdminId: string;
    tokenHash: string;
    expiresAt: string;
  }): Promise<PlatformAdminInviteRow> {
    const admin = await this.platformAdminRepository.transaction(async tx => {
      const inserted = await this.platformAdminRepository.insertInvitedAdmin(tx, {
        email: input.email,
        invitedByPlatformAdminId: input.invitedByPlatformAdminId,
      });
      await this.platformAdminRepository.insertInviteToken(tx, {
        platformAdminId: inserted.id,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      });
      return inserted;
    });

    return {
      id: admin.id,
      email: input.email,
      status: PlatformAdminStatus.INVITED,
      invitedAt: new Date().toISOString(),
      expiresAt: input.expiresAt,
      // Always false: this path is how every non-root admin comes to exist in the first place —
      // root is only ever seeded (`seed-platform-admin.ts`), never invited.
      isRoot: false,
    };
  }

  /**
   * Returns the revoked invite's own id/email, or which of the two failure modes occurred — a
   * missing id and an already-accepted admin are different answers to the caller (404 vs 409),
   * see `PlatformAdminRepository.deleteInvitedAdmin`.
   */
  async revokeInvite(id: string): Promise<RevokeInviteOutcome> {
    return this.platformAdminRepository.deleteInvitedAdmin(id);
  }

  /** See `PlatformAdminRepository.countActiveGoogleOnlyAdmins` — backs the social-login lockout guard. */
  async countActiveGoogleOnlyAdmins(): Promise<number> {
    return this.platformAdminRepository.countActiveGoogleOnlyAdmins();
  }

  /** See `PlatformAdminRepository.findByGoogleIdentity` — the login-side read of a linked admin identity. */
  async findByGoogleIdentity(providerUserId: string): Promise<{
    id: string;
    email: string;
    status: PlatformAdminStatus;
    locale: Locale | null;
  } | null> {
    return this.platformAdminRepository.findByGoogleIdentity(providerUserId);
  }

  /** See `PlatformAdminRepository.findInviteEmailByTokenHash` — read-only, does not consume. */
  async findInviteEmailByTokenHash(tokenHash: string): Promise<{ email: string } | null> {
    return this.platformAdminRepository.findInviteEmailByTokenHash(tokenHash);
  }

  /** See `PlatformAdminRepository.acceptInviteWithPassword`. */
  async acceptInviteWithPassword(input: {
    tokenHash: string;
    passwordHash: string;
  }): Promise<AcceptInviteOutcome> {
    return this.platformAdminRepository.acceptInviteWithPassword(input);
  }

  /** See `PlatformAdminRepository.acceptInviteWithGoogleIdentity`. */
  async acceptInviteWithGoogleIdentity(input: {
    tokenHash: string;
    providerUserId: string;
  }): Promise<AcceptInviteOutcome> {
    return this.platformAdminRepository.acceptInviteWithGoogleIdentity(input);
  }
}
