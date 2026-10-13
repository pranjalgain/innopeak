import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import { VerifyEmailTokenProvider } from '@auth/providers/verify-email-token.provider';
import { OtpAttemptService } from '@auth/services/otp-attempt.service';
import { TokenService } from '@auth/services/token.service';
import type { PlatformAdminAuthUser, TenantAuthUser } from '@auth/types/auth.type';
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
    updatePasswordHash: jest.Mock;
    listInvites: jest.Mock;
    createInvite: jest.Mock;
    revokeInvite: jest.Mock;
    deleteExpiredInvite: jest.Mock;
    findStatusById: jest.Mock;
    isRootAdmin: jest.Mock;
    putSetPasswordOtp: jest.Mock;
    consumeSetPasswordOtp: jest.Mock;
    setStatusGuardingLastActive: jest.Mock;
    countActiveGoogleOnlyAdmins: jest.Mock;
    updateLocale: jest.Mock;
  };
  let platformSettingsDbService: { get: jest.Mock; update: jest.Mock };
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };
  let hashingService: { hash: jest.Mock; compare: jest.Mock };
  let queueManager: {
    addAdminInviteEmailJob: jest.Mock;
    addAdminSetPasswordOtpEmailJob: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let tokenService: { signPlatformAdminAccessToken: jest.Mock };
  let otpAttemptService: { consumeAttempt: jest.Mock; claimResend: jest.Mock; reset: jest.Mock };
  let verifyEmailTokenProvider: { generate: jest.Mock };

  const admin: PlatformAdminAuthUser = {
    type: JwtTokenType.PLATFORM_ADMIN,
    id: 'admin-1',
    email: 'admin@innopeak.com',
    locale: null,
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
    locale: null,
  };

  beforeEach(async () => {
    platformAdminDbService = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      updatePasswordHash: jest.fn(),
      listInvites: jest.fn(),
      createInvite: jest.fn(),
      revokeInvite: jest.fn(),
      deleteExpiredInvite: jest.fn(),
      findStatusById: jest.fn(),
      // Default: nobody is root, so the root-admin guard stays inert unless a test targets it.
      isRootAdmin: jest.fn().mockResolvedValue(false),
      putSetPasswordOtp: jest.fn(),
      consumeSetPasswordOtp: jest.fn(),
      setStatusGuardingLastActive: jest.fn(),
      // Default: no Google-only admins, so the social-login lockout guard stays inert.
      countActiveGoogleOnlyAdmins: jest.fn().mockResolvedValue(0),
      updateLocale: jest.fn(),
    };
    platformSettingsDbService = { get: jest.fn(), update: jest.fn() };
    adminOverviewDbService = { recordActivityBestEffort: jest.fn() };
    hashingService = { hash: jest.fn(), compare: jest.fn() };
    queueManager = {
      addAdminInviteEmailJob: jest.fn().mockResolvedValue(undefined),
      addAdminSetPasswordOtpEmailJob: jest.fn().mockResolvedValue(undefined),
    };
    configService = {
      get: jest.fn((key: string) => {
        return key === 'FRONTEND_URL' ? 'https://app.innopeak.test' : undefined;
      }),
    };
    tokenService = {
      signPlatformAdminAccessToken: jest
        .fn()
        .mockReturnValue({ accessToken: 'admin-access-token', expiresIn: 900 }),
    };
    // Defaults leave the OTP attempt/resend limits inert unless a test targets the add-password flow.
    otpAttemptService = {
      consumeAttempt: jest.fn().mockResolvedValue(true),
      claimResend: jest.fn().mockResolvedValue(true),
      reset: jest.fn().mockResolvedValue(undefined),
    };
    verifyEmailTokenProvider = { generate: jest.fn().mockReturnValue('482913') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminSettingsService,
        { provide: PlatformAdminDbService, useValue: platformAdminDbService },
        { provide: PlatformSettingsDbService, useValue: platformSettingsDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
        { provide: HashingService, useValue: hashingService },
        { provide: AddingJobsToQueueManager, useValue: queueManager },
        { provide: ConfigService, useValue: configService },
        { provide: TokenService, useValue: tokenService },
        { provide: OtpAttemptService, useValue: otpAttemptService },
        { provide: VerifyEmailTokenProvider, useValue: verifyEmailTokenProvider },
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

  describe('updateLocale', () => {
    it('rejects a tenant-user token without persisting anything', async () => {
      await expect(target.updateLocale(tenantUser, { locale: 'de' })).rejects.toThrow(
        ForbiddenException
      );
      expect(platformAdminDbService.updateLocale).not.toHaveBeenCalled();
    });

    it('throws 404 if the admin row is gone by the time the write lands', async () => {
      platformAdminDbService.updateLocale.mockResolvedValue(null);

      await expect(target.updateLocale(admin, { locale: 'de' })).rejects.toThrow(NotFoundException);
      expect(tokenService.signPlatformAdminAccessToken).not.toHaveBeenCalled();
    });

    it('persists the new locale and reissues the access token with it on the claim', async () => {
      const updatedRow = { ...profileRow, locale: 'de' as const };
      platformAdminDbService.updateLocale.mockResolvedValue(updatedRow);

      const result = await target.updateLocale(admin, { locale: 'de' });

      expect(platformAdminDbService.updateLocale).toHaveBeenCalledWith('admin-1', 'de');
      expect(tokenService.signPlatformAdminAccessToken).toHaveBeenCalledWith(
        updatedRow,
        expect.any(Number)
      );
      expect(result).toMatchObject({
        accessToken: 'admin-access-token',
        expiresIn: 900,
        admin: { email: 'admin@innopeak.com', locale: 'de' },
      });
    });

    // Guards the session-extension hole: admins have no refresh token, so a full-TTL replacement
    // would let a leaked access token be kept alive by pinging this route.
    it("re-signs to the presented token's own deadline rather than a fresh TTL", async () => {
      platformAdminDbService.updateLocale.mockResolvedValue({ ...profileRow, locale: 'de' });
      const sixtySecondsLeft = Math.floor(Date.now() / 1000) + 60;

      await target.updateLocale({ ...admin, sessionExpiresAt: sixtySecondsLeft }, { locale: 'de' });

      const [, expiresInSeconds] = tokenService.signPlatformAdminAccessToken.mock.calls[0] as [
        unknown,
        number,
      ];
      expect(expiresInSeconds).toBeLessThanOrEqual(60);
      expect(expiresInSeconds).toBeGreaterThan(0);
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

    it('rejects a new password identical to the current one', async () => {
      platformAdminDbService.findById.mockResolvedValue(profileRow);
      hashingService.compare.mockResolvedValue(true);

      await expect(
        target.changePassword(admin, { currentPassword: 'Old@Pass1', newPassword: 'Old@Pass1' })
      ).rejects.toMatchObject({ response: { code: 'NEW_PASSWORD_SAME_AS_CURRENT' } });
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

  describe('requestSetPasswordOtp', () => {
    it('rejects an admin that already has a password set', async () => {
      platformAdminDbService.findById.mockResolvedValue(profileRow);

      await expect(target.requestSetPasswordOtp(admin)).rejects.toThrow(BadRequestException);
      expect(platformAdminDbService.putSetPasswordOtp).not.toHaveBeenCalled();
    });

    it('mints and stores an OTP for a passwordless admin', async () => {
      platformAdminDbService.findById.mockResolvedValue({ ...profileRow, passwordHash: null });

      const result = await target.requestSetPasswordOtp(admin);

      expect(verifyEmailTokenProvider.generate).toHaveBeenCalled();
      expect(platformAdminDbService.putSetPasswordOtp).toHaveBeenCalledWith(
        expect.objectContaining({ platformAdminId: 'admin-1' })
      );
      expect(queueManager.addAdminSetPasswordOtpEmailJob).toHaveBeenCalledWith(
        JobName.ADMIN_SET_PASSWORD_OTP_EMAIL,
        expect.objectContaining({ email: 'admin@innopeak.com' })
      );
      expect(result.message).toBe(MESSAGES.AUTH.SET_PASSWORD_OTP_ACK);
    });

    // A live resend cooldown acks without minting a second code or email.
    it('acknowledges without minting a new code when the resend cooldown is still live', async () => {
      platformAdminDbService.findById.mockResolvedValue({ ...profileRow, passwordHash: null });
      otpAttemptService.claimResend.mockResolvedValue(false);

      const result = await target.requestSetPasswordOtp(admin);

      expect(platformAdminDbService.putSetPasswordOtp).not.toHaveBeenCalled();
      expect(queueManager.addAdminSetPasswordOtpEmailJob).not.toHaveBeenCalled();
      expect(result.message).toBe(MESSAGES.AUTH.SET_PASSWORD_OTP_ACK);
    });
  });

  describe('setPassword', () => {
    const dto = { newPassword: 'NewStr0ng@Pass', otp: '482913' };

    it('rejects an admin that already has a password set', async () => {
      platformAdminDbService.findById.mockResolvedValue(profileRow);

      await expect(target.setPassword(admin, dto)).rejects.toThrow(BadRequestException);
      expect(platformAdminDbService.consumeSetPasswordOtp).not.toHaveBeenCalled();
    });

    it('rejects once the OTP attempt budget is spent, without checking the code', async () => {
      platformAdminDbService.findById.mockResolvedValue({ ...profileRow, passwordHash: null });
      otpAttemptService.consumeAttempt.mockResolvedValue(false);

      await expect(target.setPassword(admin, dto)).rejects.toThrow(
        MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS
      );
      expect(platformAdminDbService.consumeSetPasswordOtp).not.toHaveBeenCalled();
    });

    it('rejects an invalid or expired OTP without writing a hash', async () => {
      platformAdminDbService.findById.mockResolvedValue({ ...profileRow, passwordHash: null });
      platformAdminDbService.consumeSetPasswordOtp.mockResolvedValue(false);

      await expect(target.setPassword(admin, dto)).rejects.toThrow(
        MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP
      );
      expect(platformAdminDbService.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('sets the password on a valid OTP', async () => {
      platformAdminDbService.findById.mockResolvedValue({ ...profileRow, passwordHash: null });
      platformAdminDbService.consumeSetPasswordOtp.mockResolvedValue(true);
      hashingService.hash.mockResolvedValue('new-hashed-password');

      const result = await target.setPassword(admin, dto);

      expect(platformAdminDbService.updatePasswordHash).toHaveBeenCalledWith(
        'admin-1',
        'new-hashed-password'
      );
      // Releases the attempt budget, else a code accepted on the last try leaves the account locked out.
      expect(otpAttemptService.reset).toHaveBeenCalledWith(admin.email);
      expect(result).toEqual({ message: MESSAGES.AUTH.PASSWORD_SET });
    });

    /**
     * `platform_admin_invites.token_hash` is UNIQUE and OTPs are 6 digits (in dev every admin gets the same
     * code), so the digest is bound to the admin: identical codes must still store different hashes.
     */
    it('stores a digest bound to the admin, so an identical code from two admins cannot collide', async () => {
      platformAdminDbService.findById.mockResolvedValue({ ...profileRow, passwordHash: null });
      verifyEmailTokenProvider.generate.mockReturnValue('000000');

      await target.requestSetPasswordOtp(admin);
      await target.requestSetPasswordOtp({ ...admin, id: 'admin-2' });

      const [first, second] = platformAdminDbService.putSetPasswordOtp.mock.calls;
      expect(first?.[0]?.tokenHash).not.toEqual(second?.[0]?.tokenHash);
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

    // Nothing sweeps `platform_admin_invites`, so a lapsed invite must not claim its address forever.
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

    // Allowed: tenant and admin logins are separate routes, cookies and lockout scopes, so nothing is shadowed.
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

    // `!isProduction()` additionally logs the raw invite link; this is the test that asserts it.
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

    // 409, not 404: the admin sees this row in the roster, so "not found" would be misleading.
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
     * The guard is atomic inside `setStatusGuardingLastActive`; this only checks that a `last_active`
     * outcome maps to the right HTTP error.
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

    // Regression: root could be disabled once a third admin existed; the guard must fire even while others are active.
    it('refuses to disable the root admin, even when other admins remain active', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.ACTIVE);
      platformAdminDbService.isRootAdmin.mockResolvedValue(true);

      await expect(
        target.setAdminStatus(admin, { targetAdminId: 'root-admin', enabled: false })
      ).rejects.toThrow(MESSAGES.ADMIN.CANNOT_DISABLE_ROOT_ADMIN);
      expect(platformAdminDbService.setStatusGuardingLastActive).not.toHaveBeenCalled();
    });

    it('allows re-enabling the root admin, if it was somehow left disabled', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.DISABLED);
      platformAdminDbService.isRootAdmin.mockResolvedValue(true);
      platformAdminDbService.setStatusGuardingLastActive.mockResolvedValue({
        outcome: 'updated',
        id: 'root-admin',
        email: 'root@innopeak.com',
        status: PlatformAdminStatus.ACTIVE,
      });

      const result = await target.setAdminStatus(admin, {
        targetAdminId: 'root-admin',
        enabled: true,
      });

      expect(result.admin.isRoot).toBe(true);
      expect(result.message).toBe(MESSAGES.ADMIN.ADMIN_ENABLED);
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

    // Lockout prevention: a Google-only admin has no password_hash, so `socialLoginEnabled` is their only way in.
    it('refuses to turn off Google sign-in while an admin has no other credential', async () => {
      platformSettingsDbService.get.mockResolvedValue(allEnabledRow);
      platformAdminDbService.countActiveGoogleOnlyAdmins.mockResolvedValue(2);

      await expect(
        target.updatePlatformSettings(admin, { socialLoginEnabled: false })
      ).rejects.toThrow(BadRequestException);
      expect(platformSettingsDbService.update).not.toHaveBeenCalled();
    });

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

    // Scoped to the transition: re-asserting an already-off setting is a no-op, not a 400.
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
