import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { requirePlatformAdmin } from '@auth/utils/require-platform-admin.util';
import { hashToken } from '@auth/utils/token.utils';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { HashingService } from '@common/hashing/hashing.service';
import { isCheckViolation, isUniqueViolation } from '@db/helpers/pg-error.util';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AdminUsersDbService } from '@db/repositories/admin-users/admin-users.db-service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import type { PlatformSettingsPatch } from '@db/repositories/platform-settings/platform-settings.repository';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { randomBytes } from 'crypto';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { PlatformSettingsResponseDto } from '../../settings/dto/platform-settings-response.dto';
import { AdminInviteResponseDto } from '../dto/admin-invite-response.dto';
import { AdminProfileResponseDto } from '../dto/admin-profile-response.dto';
import { ChangeAdminPasswordDto } from '../dto/change-admin-password.dto';
import { SendAdminInviteDto } from '../dto/send-admin-invite.dto';
import { UpdatePlatformSettingsDto } from '../dto/update-platform-settings.dto';

/** Matches the frontend mock's own window — see `PlatformAdminInviteService`. */
const INVITE_TTL_DAYS = 7;

export interface SetAdminStatusParams {
  targetAdminId: string;
  enabled: boolean;
}

/** `message` rides along so the controller never has to branch on `enabled` itself to pick
 *  between `MESSAGES.ADMIN.ADMIN_ENABLED`/`ADMIN_DISABLED` — that decision belongs here. */
export interface SetAdminStatusResult {
  admin: AdminInviteResponseDto;
  message: string;
}

@Injectable()
export class AdminSettingsService {
  constructor(
    private readonly platformAdminDbService: PlatformAdminDbService,
    private readonly adminUsersDbService: AdminUsersDbService,
    private readonly platformSettingsDbService: PlatformSettingsDbService,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly hashingService: HashingService
  ) {}

  async getProfile(actor: AuthUser): Promise<AdminProfileResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new NotFoundException(MESSAGES.ADMIN.USER_NOT_FOUND);
    }
    return AdminProfileResponseDto.from(row);
  }

  async updateAvatar(actor: AuthUser, avatarUrl: string): Promise<AdminProfileResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.updateAvatarUrl(admin.id, avatarUrl);
    if (!row) {
      throw new NotFoundException(MESSAGES.ADMIN.USER_NOT_FOUND);
    }
    return AdminProfileResponseDto.from(row);
  }

  /**
   * Same shape as `AuthService.changePassword`: proof of the current password, then a new hash.
   * No session to revoke afterward — a platform admin has no refresh-token concept yet (see
   * `TokenService.signPlatformAdminAccessToken`), so there is nothing else to rotate.
   */
  async changePassword(actor: AuthUser, dto: ChangeAdminPasswordDto): Promise<void> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const row = await this.platformAdminDbService.findById(admin.id);
    if (!row) {
      throw new NotFoundException(MESSAGES.ADMIN.USER_NOT_FOUND);
    }
    if (!row.passwordHash) {
      throw new BadRequestException(MESSAGES.AUTH.NO_PASSWORD_SET);
    }

    const currentMatches = await this.hashingService.compare(dto.currentPassword, row.passwordHash);
    if (!currentMatches) {
      throw new UnauthorizedException(MESSAGES.AUTH.INVALID_CURRENT_PASSWORD);
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);
    await this.platformAdminDbService.updatePasswordHash(admin.id, newPasswordHash);
  }

  async listInvites(actor: AuthUser): Promise<AdminInviteResponseDto[]> {
    requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const rows = await this.platformAdminDbService.listInvites();
    return rows.map(row => AdminInviteResponseDto.from(row));
  }

  /**
   * Creates the invited admin's row and its invite token, but does **not** email it or expose an
   * accept-invite endpoint yet — that pairing (a public "accept invite, set a password" flow,
   * mirroring signup/verify-email) is a separate, comparably-sized feature. An invited admin
   * exists in the roster and can be revoked, but cannot yet complete onboarding on their own.
   */
  async sendInvite(actor: AuthUser, dto: SendAdminInviteDto): Promise<AdminInviteResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);

    // `platform_admins` and `users` are entirely separate identity tables — nothing about
    // `AuthService.signup` ever checks this one, so a colliding email is only caught here. Left
    // uncaught, login would resolve the collision by checking `platform_admins` first (see that
    // method's own comment), silently shadowing the tenant account once this invite is accepted.
    //
    // Deliberately checked before the lapsed-invite cleanup below, which is a real mutation: a
    // request that ends up rejected here must not have already deleted a roster row on its way to
    // being rejected — the caller sees a clean 409 and has every reason to believe nothing changed.
    const belongsToTenantUser = await this.adminUsersDbService.existsByEmail(dto.email);
    if (belongsToTenantUser) {
      throw new ConflictException(MESSAGES.ADMIN.EMAIL_BELONGS_TO_TENANT_USER);
    }

    // A lapsed invite is not a live claim on this address. Previously any existing row answered
    // 409, and since nothing expires or sweeps `platform_admin_invites`, a single invite that was
    // never accepted burned that email permanently — the only escape was to notice the stale row
    // in the roster and revoke it by hand. Re-inviting now replaces it, which is what "send
    // invite" already means to the person clicking it.
    const existing = await this.platformAdminDbService.findByEmail(dto.email);
    if (existing) {
      const isLapsedInvite =
        existing.status === PlatformAdminStatus.INVITED &&
        existing.inviteExpiresAt !== null &&
        new Date(existing.inviteExpiresAt).getTime() <= Date.now();

      if (!isLapsedInvite) {
        throw new ConflictException(MESSAGES.ADMIN.EMAIL_ALREADY_INVITED);
      }

      // Cascades to the invite row. Safe against an accepted admin: the delete is scoped to
      // `status = 'invited'`, so a race that accepts the invite in between is a no-op here and the
      // insert below then fails on the unique email index rather than clobbering a real account.
      await this.platformAdminDbService.deleteExpiredInvite(existing.id);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // The `findByEmail` checks above are read-then-write, so two admins inviting the same address
    // at once (or one double-clicking — the route allows 5/min) can both pass them and the second
    // insert still hits `idx_platform_admins_email`. That is the index doing its job; catching it
    // turns what was a raw 500 into the same 409 the guard above would have given.
    let row;
    try {
      row = await this.platformAdminDbService.createInvite({
        email: dto.email,
        invitedByPlatformAdminId: admin.id,
        tokenHash: hashToken(rawToken),
        expiresAt,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(MESSAGES.ADMIN.EMAIL_ALREADY_INVITED);
      }
      throw error;
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.ADMIN_INVITE_SENT,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      targetEmail: dto.email,
    });

    return AdminInviteResponseDto.from(row);
  }

  /**
   * The two failure modes answer differently: an unknown id is a 404, while an id that exists but
   * has already been accepted is a 409 — the invite is still visible in the roster, so telling
   * that admin "Invite not found" describes something they can plainly see is there.
   */
  async revokeInvite(actor: AuthUser, inviteId: string): Promise<void> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);
    const revoked = await this.platformAdminDbService.revokeInvite(inviteId);

    if (revoked.outcome === 'not_found') {
      throw new NotFoundException(MESSAGES.ADMIN.INVITE_NOT_FOUND);
    }
    if (revoked.outcome === 'not_invited') {
      throw new ConflictException(MESSAGES.ADMIN.INVITE_NOT_REVOCABLE);
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: PlatformActivityType.ADMIN_INVITE_REVOKED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      targetEmail: revoked.email,
    });
  }

  /**
   * Disables or re-enables another platform admin. This is what makes the disabled state reachable
   * at all — nothing in `src/` wrote `platform_admins.status` before, so an admin could only be
   * disabled by hand in the DB. Paired with the per-request status check in `JwtStrategy`, a
   * disable takes effect on the target's very next request rather than lingering for the token's
   * 15-minute life.
   *
   * Three guards, all to prevent locking the platform out of its own admin console:
   *  - you cannot change your own status (an admin disabling themselves is only ever a mistake);
   *  - you cannot disable an `invited` admin (it has no active session to end — revoke the invite);
   *  - you cannot disable the last remaining active admin (that would leave no one able to
   *    re-enable anyone, and there is no other creation path but the one-time root seed).
   */
  async setAdminStatus(
    actor: AuthUser,
    params: SetAdminStatusParams
  ): Promise<SetAdminStatusResult> {
    const { targetAdminId, enabled } = params;
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);

    if (targetAdminId === admin.id) {
      throw new BadRequestException(MESSAGES.ADMIN.CANNOT_DISABLE_SELF);
    }

    const currentStatus = await this.platformAdminDbService.findStatusById(targetAdminId);
    if (currentStatus === null) {
      throw new NotFoundException(MESSAGES.ADMIN.ADMIN_NOT_FOUND);
    }
    if (currentStatus === PlatformAdminStatus.INVITED) {
      // An invited admin has no password and no session — "disabling" it is meaningless, and
      // enabling it would skip the (unbuilt) accept-invite flow. Steer to revoke instead.
      throw new ConflictException(MESSAGES.ADMIN.CANNOT_DISABLE_INVITED);
    }

    // The last-active-admin guard itself is NOT enforced here: a plain read-then-write (count
    // active, then write if > 1) can't actually prevent two different admins from being disabled
    // concurrently, since each disable touches a different row and neither blocks the other's
    // count query. `setStatusGuardingLastActive` re-checks the count atomically, inside the same
    // transaction as the write, guarded by an advisory lock that serializes every concurrent
    // status change. This `findStatusById` above stays only for the fast, friendly 404/409s.
    const nextStatus = enabled ? PlatformAdminStatus.ACTIVE : PlatformAdminStatus.DISABLED;
    const result = await this.platformAdminDbService.setStatusGuardingLastActive({
      id: targetAdminId,
      status: nextStatus,
    });
    if (result.outcome === 'not_found') {
      // Raced with a delete between the status read above and the guarded write.
      throw new NotFoundException(MESSAGES.ADMIN.ADMIN_NOT_FOUND);
    }
    if (result.outcome === 'last_active') {
      throw new BadRequestException(MESSAGES.ADMIN.CANNOT_DISABLE_LAST_ADMIN);
    }

    await this.adminOverviewDbService.recordActivityBestEffort({
      type: enabled ? PlatformActivityType.ADMIN_ENABLED : PlatformActivityType.ADMIN_DISABLED,
      actorPlatformAdminId: admin.id,
      actorEmail: admin.email,
      targetEmail: result.email,
    });

    // Reuses the roster DTO shape the Members tab already renders (id/email/status), so the client
    // can swap the row in place without a refetch. `invitedAt`/`expiresAt` are not meaningful for a
    // status change and are surfaced as the admin's own timestamps by `listInvites` anyway.
    return {
      admin: AdminInviteResponseDto.from({
        id: result.id,
        email: result.email,
        status: result.status,
        invitedAt: new Date().toISOString(),
        expiresAt: null,
      }),
      message: enabled ? MESSAGES.ADMIN.ADMIN_ENABLED : MESSAGES.ADMIN.ADMIN_DISABLED,
    };
  }

  /**
   * Partial by design (see `UpdatePlatformSettingsDto`) — only the fields the caller actually
   * sent are forwarded to the DB service. `exactOptionalPropertyTypes` means an omitted DTO field
   * must not appear in the patch object at all (an explicit `undefined` value is a type error and,
   * were it not, would reach Drizzle's `.set()` as a real key), so this is built up field by field
   * rather than spread directly from `dto`.
   *
   * Rejects a patch that would leave `ssoLoginEnabled`/`passwordLoginEnabled`/`socialLoginEnabled`
   * all false — a tenant with zero working sign-in methods is a real outage, not just a UX gap.
   * The same invariant is also a DB-level CHECK constraint (`platform_settings_at_least_one_method_check`)
   * as defense-in-depth against a future write path that skips this service; this check exists
   * mainly to answer with a clean 400 instead of a raw Postgres constraint-violation 500. Note
   * this has nothing to do with *admin* login specifically — a platform admin's own password
   * field on `/login` is unconditional regardless of what this table says (see `LoginView`'s own
   * comment), since admins have no SSO identity to fall back on at all yet.
   *
   * `admin.id` — not part of `patch` — is threaded through to `update()` so
   * `platform_settings.updated_by_platform_admin_id` always reflects whoever is actually calling,
   * rather than trusting a caller-supplied value for who made the change.
   */
  async updatePlatformSettings(
    actor: AuthUser,
    dto: UpdatePlatformSettingsDto
  ): Promise<PlatformSettingsResponseDto> {
    const admin = requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY);

    const patch: PlatformSettingsPatch = {};
    if (dto.ssoLoginEnabled !== undefined) patch.ssoLoginEnabled = dto.ssoLoginEnabled;
    if (dto.passwordLoginEnabled !== undefined)
      patch.passwordLoginEnabled = dto.passwordLoginEnabled;
    if (dto.socialLoginEnabled !== undefined) patch.socialLoginEnabled = dto.socialLoginEnabled;
    if (dto.inviteMembersEnabled !== undefined)
      patch.inviteMembersEnabled = dto.inviteMembersEnabled;

    const current = await this.platformSettingsDbService.get();
    if (!current) {
      throw new NotFoundException(MESSAGES.SETTINGS.PLATFORM_CONFIG_MISSING);
    }

    const resultingSso = patch.ssoLoginEnabled ?? current.ssoLoginEnabled;
    const resultingPassword = patch.passwordLoginEnabled ?? current.passwordLoginEnabled;
    const resultingSocial = patch.socialLoginEnabled ?? current.socialLoginEnabled;
    if (!resultingSso && !resultingPassword && !resultingSocial) {
      throw new BadRequestException(MESSAGES.ADMIN.PLATFORM_SETTINGS_NO_METHOD_ENABLED);
    }

    // The check above reads then writes, so two admins each disabling a *different* method can
    // both pass it against the same `current` and the second UPDATE still trips the CHECK. Mapping
    // it back to the same 400 keeps the answer identical whether the invariant was caught here or
    // by the database.
    let row;
    try {
      row = await this.platformSettingsDbService.update(patch, admin.id);
    } catch (error) {
      if (isCheckViolation(error, 'platform_settings_at_least_one_method_check')) {
        throw new BadRequestException(MESSAGES.ADMIN.PLATFORM_SETTINGS_NO_METHOD_ENABLED);
      }
      throw error;
    }

    if (!row) {
      throw new NotFoundException(MESSAGES.SETTINGS.PLATFORM_CONFIG_MISSING);
    }
    return PlatformSettingsResponseDto.from(row);
  }
}
