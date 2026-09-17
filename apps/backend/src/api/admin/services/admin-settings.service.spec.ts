import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth-user.type';
import { JobName } from '@bg/constants/job.constant';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { HashingService } from '@common/hashing/hashing.service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AdminSettingsService } from './admin-settings.service';

import { UserRole } from '../../auth/enums/user-role.enum';

describe('AdminSettingsService', () => {
  let target: AdminSettingsService;
  let platformAdminDbService: {
    findById: jest.Mock;
    findByEmail: jest.Mock;
    updateAvatarUrl: jest.Mock;
    updatePasswordHash: jest.Mock;
    listInvites: jest.Mock;
    createInvite: jest.Mock;
    revokeInvite: jest.Mock;
    deleteExpiredInvite: jest.Mock;
    findStatusById: jest.Mock;
    setStatusGuardingLastActive: jest.Mock;
    countActiveGoogleOnlyAdmins: jest.Mock;
  };
  let platformSettingsDbService: { get: jest.Mock; update: jest.Mock };
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };
  let hashingService: { hash: jest.Mock; compare: jest.Mock };
  let queueManager: { addAdminInviteEmailJob: jest.Mock };
  let configService: { get: jest.Mock };

  const admin: PlatformAdminAuthUser = {
    type: JwtTokenType.PLATFORM_ADMIN,
    id: 'admin-1',
    email: 'admin@innopeak.com',
  };

  const tenantUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'owner@example.com',
    role: UserRole.OWNER,
    locale: null,
  };

  const profileRow = {
    id: 'admin-1',
    email: 'admin@innopeak.com',
    passwordHash: 'hashed-password',
    avatarUrl: null,
  };

  beforeEach(async () => {
    platformAdminDbService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      updateAvatarUrl: jest.fn(),
      updatePasswordHash: jest.fn(),
      listInvites: jest.fn(),
      createInvite: jest.fn(),
      revokeInvite: jest.fn(),
      deleteExpiredInvite: jest.fn(),
      findStatusById: jest.fn(),
      setStatusGuardingLastActive: jest.fn(),
      // No Google-only admins by default, so the social-login lockout guard is inert for every
      // test that isn't specifically about it.
      countActiveGoogleOnlyAdmins: jest.fn().mockResolvedValue(0),
    };
    platformSettingsDbService = { get: jest.fn(), update: jest.fn() };
    adminOverviewDbService = { recordActivityBestEffort: jest.fn() };
    hashingService = { hash: jest.fn(), compare: jest.fn() };
    queueManager = { addAdminInviteEmailJob: jest.fn().mockResolvedValue(undefined) };
    configService = {
      get: jest.fn((key: string) => {
        return key === 'FRONTEND_URL' ? 'https://app.innopeak.test' : undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSettingsService,
        { provide: PlatformAdminDbService, useValue: platformAdminDbService },
        { provide: PlatformSettingsDbService, useValue: platformSettingsDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
        { provide: HashingService, useValue: hashingService },
        { provide: AddingJobsToQueueManager, useValue: queueManager },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(AdminSettingsService);
  });

  describe('getProfile', () => {
    it('rejects a tenant-user token without looking up a profile', async () => {
      await expect(target.getProfile(tenantUser)).rejects.toThrow(ForbiddenException);
      expect(platformAdminDbService.findById).not.toHaveBeenCalled();
    });

    it('returns the profile for the signed-in admin', async () => {
      platformAdminDbService.findById.mockResolvedValue(profileRow);

      const result = await target.getProfile(admin);

      expect(platformAdminDbService.findById).toHaveBeenCalledWith('admin-1');
      expect(result.email).toBe('admin@innopeak.com');
    });
  });

  describe('changePassword', () => {
    const dto = { currentPassword: 'Old@Pass1', newPassword: 'New@Str0ngPass' };

    it('rejects an account with no password set (SSO-only)', async () => {
      platformAdminDbService.findById.mockResolvedValue({ ...profileRow, passwordHash: null });

      await expect(target.changePassword(admin, dto)).rejects.toThrow(BadRequestException);
    });

    it('rejects a wrong current password without writing a new hash', async () => {
      platformAdminDbService.findById.mockResolvedValue(profileRow);
      hashingService.compare.mockResolvedValue(false);

      await expect(target.changePassword(admin, dto)).rejects.toThrow(UnauthorizedException);
      expect(platformAdminDbService.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('updates the hash on a correct current password', async () => {
      platformAdminDbService.findById.mockResolvedValue(profileRow);
      hashingService.compare.mockResolvedValue(true);
      hashingService.hash.mockResolvedValue('new-hashed-password');

      await target.changePassword(admin, dto);

      expect(platformAdminDbService.updatePasswordHash).toHaveBeenCalledWith(
        'admin-1',
        'new-hashed-password'
      );
    });
  });

  describe('sendInvite', () => {
    it('rejects an email that already belongs to a platform admin or has a pending invite', async () => {
      platformAdminDbService.findByEmail.mockResolvedValue({
        id: 'existing-1',
        status: PlatformAdminStatus.INVITED,
        inviteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      await expect(target.sendInvite(admin, { email: 'existing@innopeak.com' })).rejects.toThrow(
        ConflictException
      );
      expect(platformAdminDbService.deleteExpiredInvite).not.toHaveBeenCalled();
      expect(platformAdminDbService.createInvite).not.toHaveBeenCalled();
    });

    /**
     * Nothing expires or sweeps `platform_admin_invites`, so before this an invite that was never
     * accepted claimed its address permanently — every resend answered 409 and the only escape was
     * to spot the dead row in the roster and revoke it by hand.
     */
    it('replaces a lapsed invite instead of refusing the address forever', async () => {
      platformAdminDbService.findByEmail.mockResolvedValue({
        id: 'stale-1',
        status: PlatformAdminStatus.INVITED,
        inviteExpiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      });
      platformAdminDbService.createInvite.mockResolvedValue({
        id: 'invite-2',
        email: 'lapsed@innopeak.com',
        status: PlatformAdminStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00.000Z',
        expiresAt: '2026-03-08T00:00:00.000Z',
      });

      await expect(
        target.sendInvite(admin, { email: 'lapsed@innopeak.com' })
      ).resolves.toBeDefined();
      expect(platformAdminDbService.deleteExpiredInvite).toHaveBeenCalledWith('stale-1');
      expect(platformAdminDbService.createInvite).toHaveBeenCalled();
    });

    /** An admin who accepted is a live account, not a dead invite — that address stays claimed. */
    it('still refuses an address held by an ACTIVE admin, however old', async () => {
      platformAdminDbService.findByEmail.mockResolvedValue({
        id: 'active-1',
        status: PlatformAdminStatus.ACTIVE,
        inviteExpiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      });

      await expect(target.sendInvite(admin, { email: 'active@innopeak.com' })).rejects.toThrow(
        ConflictException
      );
      expect(platformAdminDbService.deleteExpiredInvite).not.toHaveBeenCalled();
    });

    /**
     * The other half of the dual-identity decision (`separate-admin-login-design.md`). This used
     * to 409: a single shared `login` had to resolve one email to exactly one identity table, so
     * an accepted invite would have shadowed the tenant account. Post-split there are two routes,
     * two cookies and two lockout scopes, and tenant `signup` dropped its mirror of the same
     * guard — leaving this one in place would have made the relaxation one-directional, blocking
     * exactly the case that matters: staffing the console with someone who already uses the
     * product.
     */
    it('invites an email that already belongs to a tenant user, since the two identities are independent', async () => {
      platformAdminDbService.findByEmail.mockResolvedValue(null);
      platformAdminDbService.createInvite.mockResolvedValue({
        id: 'invite-3',
        email: 'owner@example.com',
        status: PlatformAdminStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00.000Z',
        inviteExpiresAt: '2026-03-08T00:00:00.000Z',
      });

      await expect(target.sendInvite(admin, { email: 'owner@example.com' })).resolves.toMatchObject(
        { email: 'owner@example.com' }
      );
      expect(platformAdminDbService.createInvite).toHaveBeenCalled();
    });

    it('creates the invite for a genuinely new email', async () => {
      platformAdminDbService.findByEmail.mockResolvedValue(null);
      platformAdminDbService.createInvite.mockResolvedValue({
        id: 'invite-1',
        email: 'new@innopeak.com',
        status: PlatformAdminStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00.000Z',
        expiresAt: '2026-03-08T00:00:00.000Z',
      });

      const result = await target.sendInvite(admin, { email: 'new@innopeak.com' });

      expect(platformAdminDbService.createInvite).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@innopeak.com', invitedByPlatformAdminId: 'admin-1' })
      );
      expect(result.status).toBe(PlatformAdminStatus.INVITED);
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.ADMIN_INVITE_SENT,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        targetEmail: 'new@innopeak.com',
      });

      // Fire-and-forget — give the un-awaited promise a tick to run.
      await new Promise(resolve => setImmediate(resolve));
      expect(queueManager.addAdminInviteEmailJob).toHaveBeenCalledWith(
        JobName.ADMIN_INVITE_EMAIL,
        expect.objectContaining({
          email: 'new@innopeak.com',
          inviteLink: expect.stringContaining('https://app.innopeak.test/invite/'),
        })
      );
    });

    /**
     * `!isProduction()` — this codebase's one dev/prod gate — additionally logs the raw invite
     * link, so the flow is exercisable locally without a working mailbox. `NODE_ENV` is not
     * `'production'` in this test process, so this is the path every other test above already
     * runs; this test is the one that actually asserts the log happened.
     */
    it('[dev] logs the invite link directly, in addition to queuing the email', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      platformAdminDbService.findByEmail.mockResolvedValue(null);
      platformAdminDbService.createInvite.mockResolvedValue({
        id: 'invite-1',
        email: 'new@innopeak.com',
        status: PlatformAdminStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00.000Z',
        expiresAt: '2026-03-08T00:00:00.000Z',
      });

      await target.sendInvite(admin, { email: 'new@innopeak.com' });

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://app.innopeak.test/invite/')
      );
      logSpy.mockRestore();
    });
  });

  describe('revokeInvite', () => {
    it('throws 404 when there is no such invite id at all, without logging any activity', async () => {
      platformAdminDbService.revokeInvite.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.revokeInvite(admin, 'invite-1')).rejects.toThrow(NotFoundException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    /**
     * Distinct from 404 on purpose: the admin is looking straight at this row in the roster, so
     * "Invite not found" describes something they can see is there. This is the one path that
     * reaches `INVITE_NOT_REVOCABLE`, which was previously defined in both locales but unreachable.
     */
    it('throws 409 when the admin exists but has already accepted', async () => {
      platformAdminDbService.revokeInvite.mockResolvedValue({ outcome: 'not_invited' });

      await expect(target.revokeInvite(admin, 'invite-1')).rejects.toThrow(ConflictException);
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    it('succeeds when the invite is revoked and logs the activity with its email', async () => {
      platformAdminDbService.revokeInvite.mockResolvedValue({
        outcome: 'deleted',
        id: 'invite-1',
        email: 'revoked@innopeak.com',
      });

      await expect(target.revokeInvite(admin, 'invite-1')).resolves.toBeUndefined();
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.ADMIN_INVITE_REVOKED,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        targetEmail: 'revoked@innopeak.com',
      });
    });
  });

  describe('setAdminStatus', () => {
    it('disables another active admin and logs it, when others remain active', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.ACTIVE);
      platformAdminDbService.setStatusGuardingLastActive.mockResolvedValue({
        outcome: 'updated',
        id: 'admin-2',
        email: 'other@innopeak.com',
        status: PlatformAdminStatus.DISABLED,
      });

      const result = await target.setAdminStatus(admin, {
        targetAdminId: 'admin-2',
        enabled: false,
      });

      expect(platformAdminDbService.setStatusGuardingLastActive).toHaveBeenCalledWith({
        id: 'admin-2',
        status: PlatformAdminStatus.DISABLED,
      });
      expect(result.admin.status).toBe(PlatformAdminStatus.DISABLED);
      expect(result.message).toBe(MESSAGES.ADMIN.ADMIN_DISABLED);
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.ADMIN_DISABLED,
        actorPlatformAdminId: 'admin-1',
        actorEmail: 'admin@innopeak.com',
        targetEmail: 'other@innopeak.com',
      });
    });

    it('re-enables a disabled admin', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.DISABLED);
      platformAdminDbService.setStatusGuardingLastActive.mockResolvedValue({
        outcome: 'updated',
        id: 'admin-2',
        email: 'other@innopeak.com',
        status: PlatformAdminStatus.ACTIVE,
      });

      const result = await target.setAdminStatus(admin, {
        targetAdminId: 'admin-2',
        enabled: true,
      });

      expect(result.message).toBe(MESSAGES.ADMIN.ADMIN_ENABLED);
      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({ type: PlatformActivityType.ADMIN_ENABLED })
      );
    });

    it('refuses to disable your own account (self-lockout)', async () => {
      await expect(
        target.setAdminStatus(admin, { targetAdminId: 'admin-1', enabled: false })
      ).rejects.toThrow(BadRequestException);
      expect(platformAdminDbService.setStatusGuardingLastActive).not.toHaveBeenCalled();
    });

    /**
     * The guard itself is enforced atomically inside `setStatusGuardingLastActive` (see that
     * repository method's own comment on why a plain count-then-write can't prevent two
     * concurrent disables of two *different* admins from both succeeding) — this only checks that
     * the service correctly turns a `last_active` outcome into the right HTTP error.
     */
    it('refuses to disable the last active admin', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.ACTIVE);
      platformAdminDbService.setStatusGuardingLastActive.mockResolvedValue({
        outcome: 'last_active',
      });

      await expect(
        target.setAdminStatus(admin, { targetAdminId: 'admin-2', enabled: false })
      ).rejects.toThrow(BadRequestException);
    });

    it('404s when the target admin does not exist', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(null);

      await expect(
        target.setAdminStatus(admin, { targetAdminId: 'admin-2', enabled: false })
      ).rejects.toThrow(NotFoundException);
    });

    it('404s when the target was deleted between the status read and the guarded write', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.ACTIVE);
      platformAdminDbService.setStatusGuardingLastActive.mockResolvedValue({
        outcome: 'not_found',
      });

      await expect(
        target.setAdminStatus(admin, { targetAdminId: 'admin-2', enabled: false })
      ).rejects.toThrow(NotFoundException);
    });

    it('409s when the target is still an unaccepted invite', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.INVITED);

      await expect(
        target.setAdminStatus(admin, { targetAdminId: 'admin-2', enabled: false })
      ).rejects.toThrow(ConflictException);
      expect(platformAdminDbService.setStatusGuardingLastActive).not.toHaveBeenCalled();
    });

    it('rejects a tenant-user token', async () => {
      await expect(
        target.setAdminStatus(tenantUser, { targetAdminId: 'admin-2', enabled: false })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updatePlatformSettings', () => {
    const allEnabledRow = {
      ssoLoginEnabled: true,
      passwordLoginEnabled: true,
      socialLoginEnabled: true,
      inviteMembersEnabled: false,
      updatedByPlatformAdminId: null,
    };

    it('rejects a tenant-user token without touching the DB', async () => {
      await expect(target.updatePlatformSettings(tenantUser, {})).rejects.toThrow(
        ForbiddenException
      );
      expect(platformSettingsDbService.get).not.toHaveBeenCalled();
      expect(platformSettingsDbService.update).not.toHaveBeenCalled();
    });

    it('forwards only the fields present on the DTO, omitting the rest entirely', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformSettingsDbService.update.mockResolvedValue({
        ...allEnabledRow,
        ssoLoginEnabled: false,
      });

      await target.updatePlatformSettings(admin, { passwordLoginEnabled: true });

      expect(platformSettingsDbService.update).toHaveBeenCalledWith(
        { passwordLoginEnabled: true },
        admin.id
      );
    });

    it("records the calling admin's id as the actor, not anything from the request body", async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformSettingsDbService.update.mockResolvedValue({
        ...allEnabledRow,
        socialLoginEnabled: false,
        updatedByPlatformAdminId: admin.id,
      });

      await target.updatePlatformSettings(admin, { socialLoginEnabled: false });

      expect(platformSettingsDbService.update).toHaveBeenCalledWith(
        { socialLoginEnabled: false },
        admin.id
      );
    });

    it('throws 404 if the singleton row is somehow missing before the write', async () => {
      platformSettingsDbService.get.mockResolvedValue(null);

      await expect(target.updatePlatformSettings(admin, { ssoLoginEnabled: true })).rejects.toThrow(
        NotFoundException
      );
      expect(platformSettingsDbService.update).not.toHaveBeenCalled();
    });

    it('throws 404 if the singleton row goes missing between the read and the write', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformSettingsDbService.update.mockResolvedValue(null);

      await expect(
        target.updatePlatformSettings(admin, { ssoLoginEnabled: false })
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a patch that would disable every tenant-facing method at once', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);

      await expect(
        target.updatePlatformSettings(admin, {
          ssoLoginEnabled: false,
          passwordLoginEnabled: false,
          socialLoginEnabled: false,
        })
      ).rejects.toThrow(BadRequestException);
      expect(platformSettingsDbService.update).not.toHaveBeenCalled();
    });

    it('rejects disabling the one remaining enabled method, even alone in the patch', async () => {
      platformSettingsDbService.get.mockResolvedValue({
        ssoLoginEnabled: false,
        passwordLoginEnabled: true,
        socialLoginEnabled: false,
        inviteMembersEnabled: false,
        updatedByPlatformAdminId: null,
      });

      await expect(
        target.updatePlatformSettings(admin, { passwordLoginEnabled: false })
      ).rejects.toThrow(BadRequestException);
      expect(platformSettingsDbService.update).not.toHaveBeenCalled();
    });

    it('allows disabling a method when another one is left (or already) enabled', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformSettingsDbService.update.mockResolvedValue({
        ...allEnabledRow,
        passwordLoginEnabled: false,
      });

      await expect(
        target.updatePlatformSettings(admin, { passwordLoginEnabled: false })
      ).resolves.toMatchObject({ passwordLoginEnabled: false });
    });

    /**
     * Third member of the same lockout-prevention family as the two checks above and
     * `setAdminStatus`'s guards. An admin who accepted their invite through Google has no
     * `password_hash` at all, so this setting — which decides whether the login screen offers a
     * Google button — is the only thing between them and no way in, and there is no admin
     * equivalent of the tenant `set-password` flow to add a password with.
     */
    it('refuses to turn off Google sign-in while an admin has no other credential', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformAdminDbService.countActiveGoogleOnlyAdmins.mockResolvedValue(2);

      await expect(
        target.updatePlatformSettings(admin, { socialLoginEnabled: false })
      ).rejects.toThrow(BadRequestException);
      expect(platformSettingsDbService.update).not.toHaveBeenCalled();
    });

    /** The count rides along in the message so the admin knows how many accounts to deal with. */
    it('names how many admins would be stranded', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformAdminDbService.countActiveGoogleOnlyAdmins.mockResolvedValue(3);

      await expect(
        target.updatePlatformSettings(admin, { socialLoginEnabled: false })
      ).rejects.toThrow(MESSAGES.ADMIN.CANNOT_DISABLE_SOCIAL_LOGIN_GOOGLE_ONLY_ADMIN(3));
    });

    it('allows turning off Google sign-in when every admin has a password', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformAdminDbService.countActiveGoogleOnlyAdmins.mockResolvedValue(0);
      platformSettingsDbService.update.mockResolvedValue({
        ...allEnabledRow,
        socialLoginEnabled: false,
      });

      await expect(
        target.updatePlatformSettings(admin, { socialLoginEnabled: false })
      ).resolves.toMatchObject({ socialLoginEnabled: false });
    });

    /**
     * Scoped to the transition, not the resulting state: an admin stranded by Google already
     * being off is recovered by turning it back on, and answering 400 to a no-op re-assertion
     * would make that state look like this guard's doing.
     */
    it('does not block a no-op when Google sign-in is already off', async () => {
      const socialOffRow = { ...allEnabledRow, socialLoginEnabled: false };
      platformSettingsDbService.get.mockResolvedValue(socialOffRow);
      platformAdminDbService.countActiveGoogleOnlyAdmins.mockResolvedValue(1);
      platformSettingsDbService.update.mockResolvedValue(socialOffRow);

      await expect(
        target.updatePlatformSettings(admin, { socialLoginEnabled: false })
      ).resolves.toMatchObject({ socialLoginEnabled: false });
      expect(platformAdminDbService.countActiveGoogleOnlyAdmins).not.toHaveBeenCalled();
    });

    it('does not spend a query on the guard when the patch leaves Google sign-in alone', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformSettingsDbService.update.mockResolvedValue({
        ...allEnabledRow,
        inviteMembersEnabled: false,
      });

      await target.updatePlatformSettings(admin, { inviteMembersEnabled: false });

      expect(platformAdminDbService.countActiveGoogleOnlyAdmins).not.toHaveBeenCalled();
    });
  });
});
