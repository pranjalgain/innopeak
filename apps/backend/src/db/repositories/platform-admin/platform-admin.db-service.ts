import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { Locale } from '@common/i18n/locale';
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

@Injectable()
export class PlatformAdminDbService {
  constructor(private readonly platformAdminRepository: PlatformAdminRepository) {}

  async findById(id: string): Promise<PlatformAdminProfileRow | null> {
    return this.platformAdminRepository.findById(id);
  }

  /** See `PlatformAdminRepository.findForLogin` — the read `PlatformAdminAuthService.login` uses. */
  async findForLogin(email: string): Promise<PlatformAdminLoginRow | null> {
    return this.platformAdminRepository.findForLogin(email);
  }

  /** Live status of an admin by id, `null` if the row is gone — see `PlatformAdminRepository.findStatusById`. */
  async findStatusById(id: string): Promise<PlatformAdminStatus | null> {
    return this.platformAdminRepository.findStatusById(id);
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

  async updateAvatarUrl(id: string, avatarUrl: string): Promise<PlatformAdminProfileRow | null> {
    await this.platformAdminRepository.updateAvatarUrl(id, avatarUrl);
    return this.platformAdminRepository.findById(id);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.platformAdminRepository.updatePasswordHash(id, passwordHash);
  }

  /** See `PlatformAdminRepository.updateLocale`. Re-fetches, same reasoning as `updateAvatarUrl`
   *  above — the caller needs the fresh row to reissue the access token's `locale` claim. */
  async updateLocale(id: string, locale: Locale): Promise<PlatformAdminProfileRow | null> {
    await this.platformAdminRepository.updateLocale(id, locale);
    return this.platformAdminRepository.findById(id);
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
