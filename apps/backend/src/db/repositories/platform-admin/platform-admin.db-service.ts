import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { UserIdentityProvider } from '@auth/enums/user-identity-provider.enum';
import type { Locale } from '@common/i18n/locale';
import { MediaDbService } from '@db/repositories/media/media.db-service';
import { Injectable } from '@nestjs/common';

import { PlatformAdminRepository } from './platform-admin.repository';
import type {
  AcceptInviteOutcome,
  LinkAdminIdentityInput,
  LinkAdminIdentityOutcome,
  PlatformAdminAlertRecipient,
  PlatformAdminInviteRow,
  PlatformAdminLoginRow,
  PlatformAdminProfileWithAvatar,
  PlatformAdminWithInviteRow,
  RevokeInviteOutcome,
  SetAdminStatusGuardInput,
  SetAdminStatusOutcome,
} from './types/platform-admin.type';

@Injectable()
export class PlatformAdminDbService {
  constructor(
    private readonly platformAdminRepository: PlatformAdminRepository,
    private readonly mediaDbService: MediaDbService
  ) {}

  /** Composed from two reads because `platform_admins` has no `avatar_url` column. */
  async findById(id: string): Promise<PlatformAdminProfileWithAvatar | null> {
    const row = await this.platformAdminRepository.findById(id);
    if (!row) return null;

    const avatarUrl = await this.mediaDbService.findAvatarUrl({ platformAdminId: id });
    return { ...row, avatarUrl };
  }

  async findForLogin(email: string): Promise<PlatformAdminLoginRow | null> {
    return this.platformAdminRepository.findForLogin(email);
  }

  async findActiveAlertRecipients(): Promise<PlatformAdminAlertRecipient[]> {
    return this.platformAdminRepository.findActiveAlertRecipients();
  }

  async findStatusById(id: string): Promise<PlatformAdminStatus | null> {
    return this.platformAdminRepository.findStatusById(id);
  }

  async isRootAdmin(id: string): Promise<boolean> {
    return this.platformAdminRepository.isRootAdmin(id);
  }

  /**
   * Issues (or reissues) the OTP `AdminSettingsService.setPassword` requires before a passwordless
   * admin can adopt one.
   */
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

  /** The last-active-admin guard lives in the repository, atomically. */
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

  /** Clears a lapsed invite so its address can be reused. */
  async deleteExpiredInvite(id: string): Promise<void> {
    return this.platformAdminRepository.deleteExpiredInvite(id);
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.platformAdminRepository.updatePasswordHash(id, passwordHash);
  }

  /** Re-fetches via this class's own `findById` so the fresh row still carries its avatar. */
  async updateLocale(id: string, locale: Locale): Promise<PlatformAdminProfileWithAvatar | null> {
    await this.platformAdminRepository.updateLocale(id, locale);
    return this.findById(id);
  }

  /**
   * The whole admin roster behind Settings → Members, not just pending invites. `invitedAt` falls
   * back to `createdAt` for the seeded root (no invite row), but `expiresAt` stays null: a fallback
   * would invent an expiry that was never real.
   */
  async listInvites(): Promise<PlatformAdminInviteRow[]> {
    const rows = await this.platformAdminRepository.findAllWithInvites();
    return rows.map(toInviteRow);
  }

  /** One admin's roster row, as `listInvites` would list it. */
  async findInviteRowById(id: string): Promise<PlatformAdminInviteRow | null> {
    const row = await this.platformAdminRepository.findWithInviteById(id);
    return row ? toInviteRow(row) : null;
  }

  /**
   * Both inserts run in one transaction so a failure between them cannot leave an invited admin
   * with no invite recorded.
   */
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
      // Always false: root is only ever seeded, never invited.
      isRoot: false,
    };
  }

  /**
   * Returns the revoked invite's id/email, or which failure occurred: a missing id (404) and an
   * already-accepted admin (409) are different answers.
   */
  async revokeInvite(id: string): Promise<RevokeInviteOutcome> {
    return this.platformAdminRepository.deleteInvitedAdmin(id);
  }

  /** The login-side read of a linked admin identity. */
  async findByGoogleIdentity(providerUserId: string): Promise<{
    id: string;
    email: string;
    status: PlatformAdminStatus;
    locale: Locale | null;
  } | null> {
    return this.platformAdminRepository.findByGoogleIdentity(providerUserId);
  }

  /** The provider-neutral login-side read of a linked admin identity. */
  async findByIdentity(
    provider: UserIdentityProvider,
    providerUserId: string
  ): Promise<{
    id: string;
    email: string;
    status: PlatformAdminStatus;
    locale: Locale | null;
  } | null> {
    return this.platformAdminRepository.findByIdentity(provider, providerUserId);
  }

  async linkIdentityByEmail(input: LinkAdminIdentityInput): Promise<LinkAdminIdentityOutcome> {
    return this.platformAdminRepository.linkIdentityByEmail(input);
  }

  /** Read-only; does not consume. */
  async findInviteEmailByTokenHash(tokenHash: string): Promise<{ email: string } | null> {
    return this.platformAdminRepository.findInviteEmailByTokenHash(tokenHash);
  }

  async acceptInviteWithPassword(input: {
    tokenHash: string;
    passwordHash: string;
  }): Promise<AcceptInviteOutcome> {
    return this.platformAdminRepository.acceptInviteWithPassword(input);
  }

  async acceptInviteWithSsoIdentity(input: {
    tokenHash: string;
    provider: UserIdentityProvider;
    providerUserId: string;
  }): Promise<AcceptInviteOutcome> {
    return this.platformAdminRepository.acceptInviteWithSsoIdentity(input);
  }
}

function toInviteRow(row: PlatformAdminWithInviteRow): PlatformAdminInviteRow {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    invitedAt: row.inviteCreatedAt ?? row.createdAt,
    expiresAt: row.inviteExpiresAt,
    isRoot: row.invitedByPlatformAdminId === null,
  };
}
