import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { HashingService } from '@common/hashing/hashing.service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AccountDeletionService, SELF_SERVICE_ACTOR_LABEL } from './account-deletion.service';
import { ErasureNoticeService } from './erasure-notice.service';
import { LoginAttemptService } from './login-attempt.service';
import { OtpAttemptService } from './otp-attempt.service';
import { SessionRevocationService } from './session-revocation.service';

import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { VerifyEmailTokenProvider } from '../providers/verify-email-token.provider';
import type { AuthUser } from '../types/auth.type';

describe('AccountDeletionService', () => {
  let target: AccountDeletionService;
  let authDb: Record<string, jest.Mock>;
  let hashing: { compare: jest.Mock; hash: jest.Mock };
  let otpAttempts: Record<string, jest.Mock>;
  let loginAttempts: Record<string, jest.Mock>;
  let queue: { addRegisterationOtpEmailJob: jest.Mock };
  let billing: Record<string, jest.Mock>;
  let activity: { recordActivityBestEffort: jest.Mock };
  let notices: { notifyScheduled: jest.Mock; notifyCancelled: jest.Mock };
  let sessions: { revokeTenant: jest.Mock };

  const owner = {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Jane',
    email: 'jane@acme.com',
    passwordHash: 'hash',
    role: UserRole.OWNER,
    status: UserStatus.ACTIVE,
    locale: null,
  };
  const ssoOwner = { ...owner, passwordHash: null };
  const actor: AuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'jane@acme.com',
    role: UserRole.OWNER,
    locale: null,
  };
  const activeTenant = {
    status: TenantStatus.ACTIVE,
    name: 'Acme Dental',
    erasureRequestedAt: null,
    erasureRequestedByUserId: null,
  };

  beforeEach(async () => {
    authDb = {
      findUserById: jest.fn().mockResolvedValue(owner),
      findUserForLogin: jest.fn().mockResolvedValue(owner),
      findTenantErasureState: jest.fn().mockResolvedValue(activeTenant),
      requestTenantErasureBySelf: jest.fn().mockResolvedValue({ name: 'Acme Dental' }),
      cancelSelfRequestedErasure: jest.fn().mockResolvedValue({ name: 'Acme Dental' }),
      putDeleteAccountOtp: jest.fn().mockResolvedValue(undefined),
      consumeDeleteAccountOtp: jest.fn().mockResolvedValue(true),
      revokeAllRefreshTokensForUser: jest.fn().mockResolvedValue(undefined),
    };
    hashing = {
      compare: jest.fn().mockResolvedValue(true),
      hash: jest.fn().mockResolvedValue('h'),
    };
    otpAttempts = {
      claimResend: jest.fn().mockResolvedValue(true),
      releaseResend: jest.fn().mockResolvedValue(undefined),
      consumeAttempt: jest.fn().mockResolvedValue(true),
      reset: jest.fn(),
    };
    loginAttempts = {
      isLockedOut: jest.fn().mockResolvedValue(false),
      recordFailure: jest.fn(),
      reset: jest.fn(),
    };
    queue = { addRegisterationOtpEmailJob: jest.fn().mockResolvedValue(undefined) };
    billing = {
      scheduleCancellationForErasure: jest.fn().mockResolvedValue(undefined),
      resumeAfterErasureCancelled: jest.fn().mockResolvedValue(undefined),
    };
    activity = { recordActivityBestEffort: jest.fn().mockResolvedValue(undefined) };
    notices = {
      notifyScheduled: jest.fn().mockResolvedValue(undefined),
      notifyCancelled: jest.fn().mockResolvedValue(undefined),
    };

    sessions = { revokeTenant: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccountDeletionService,
        { provide: AuthDbService, useValue: authDb },
        { provide: HashingService, useValue: hashing },
        { provide: VerifyEmailTokenProvider, useValue: { generate: () => '482913' } },
        { provide: OtpAttemptService, useValue: otpAttempts },
        { provide: LoginAttemptService, useValue: loginAttempts },
        { provide: AddingJobsToQueueManager, useValue: queue },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: BillingReconciliationService, useValue: billing },
        { provide: AdminOverviewDbService, useValue: activity },
        { provide: ErasureNoticeService, useValue: notices },
        { provide: SessionRevocationService, useValue: sessions },
      ],
    }).compile();
    target = moduleRef.get(AccountDeletionService);
  });

  describe('requestOtp', () => {
    it('mails a code to an owner without a password', async () => {
      authDb['findUserById']!.mockResolvedValue(ssoOwner);

      await target.requestOtp(actor);

      expect(authDb['putDeleteAccountOtp']).toHaveBeenCalledTimes(1);
      expect(queue.addRegisterationOtpEmailJob).toHaveBeenCalledTimes(1);
    });

    it('answers 503 and gives the cooldown back when the email queue refuses the code', async () => {
      authDb['findUserById']!.mockResolvedValue(ssoOwner);
      queue.addRegisterationOtpEmailJob.mockRejectedValue(new Error('redis down'));

      await expect(target.requestOtp(actor)).rejects.toMatchObject({
        response: { code: 'EMAIL_QUEUE_UNAVAILABLE' },
      });

      expect(otpAttempts['releaseResend']).toHaveBeenCalled();
    });

    it('refuses an owner who has a password — they confirm with it', async () => {
      await expect(target.requestOtp(actor)).rejects.toMatchObject({
        response: { code: 'PASSWORD_REQUIRED' },
      });
      expect(queue.addRegisterationOtpEmailJob).not.toHaveBeenCalled();
    });

    it('sends nothing inside the resend cooldown but still acknowledges', async () => {
      authDb['findUserById']!.mockResolvedValue(ssoOwner);
      otpAttempts['claimResend']!.mockResolvedValue(false);

      await expect(target.requestOtp(actor)).resolves.toHaveProperty('message');
      expect(queue.addRegisterationOtpEmailJob).not.toHaveBeenCalled();
    });

    it('refuses a member', async () => {
      authDb['findUserById']!.mockResolvedValue({ ...ssoOwner, role: UserRole.MEMBER });

      await expect(target.requestOtp(actor)).rejects.toMatchObject({
        response: { code: 'ACCOUNT_DELETION_NOT_POSSIBLE' },
      });
    });
  });

  describe('deleteAccount', () => {
    it('schedules the erasure, stops billing, logs it and revokes the sessions', async () => {
      const result = await target.deleteAccount(actor, {
        businessName: 'Acme Dental',
        password: 'pw',
      });

      expect(authDb['requestTenantErasureBySelf']).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        requestedByUserId: 'user-1',
      });
      expect(billing['scheduleCancellationForErasure']).toHaveBeenCalledWith('tenant-1');
      expect(activity.recordActivityBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PlatformActivityType.BUSINESS_ERASURE_REQUESTED,
          actorPlatformAdminId: null,
          actorEmail: SELF_SERVICE_ACTOR_LABEL,
        })
      );
      expect(authDb['revokeAllRefreshTokensForUser']).toHaveBeenCalledWith('user-1');
      expect(result).toMatchObject({ gracePeriodDays: 21, canRestore: true });
    });

    // The business is suspended by the request, so every access token its users hold ends, not only the owner's.
    it("ends every user's access tokens in the business, not just the owner's", async () => {
      await target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' });

      expect(sessions.revokeTenant).toHaveBeenCalledWith('tenant-1');
    });

    it('ends no sessions when the request was refused', async () => {
      await expect(
        target.deleteAccount(actor, { businessName: 'Wrong', password: 'pw' })
      ).rejects.toBeDefined();

      expect(sessions.revokeTenant).not.toHaveBeenCalled();
    });

    it('tells the owners, attributing the request to an owner', async () => {
      await target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' });

      expect(notices.notifyScheduled).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        businessName: 'Acme Dental',
        requestedBy: 'owner',
        requesterUserId: 'user-1',
      });
    });

    it('never writes the owner’s personal email into the (never anonymized) activity log', async () => {
      await target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' });
      await target.restoreAccount({ email: 'jane@acme.com', password: 'pw' });

      for (const [entry] of activity.recordActivityBestEffort.mock.calls as Array<
        [{ actorEmail: string }]
      >) {
        expect(entry.actorEmail).toBe(SELF_SERVICE_ACTOR_LABEL);
      }
    });

    it('refuses a disabled owner whose access token is still live', async () => {
      authDb['findUserById']!.mockResolvedValue({ ...owner, status: UserStatus.DISABLED });

      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' })
      ).rejects.toMatchObject({ response: { code: 'ACCOUNT_DISABLED' } });
      expect(authDb['requestTenantErasureBySelf']).not.toHaveBeenCalled();
    });

    it('still reports success when revoking the sessions fails after the erasure committed', async () => {
      authDb['revokeAllRefreshTokensForUser']!.mockRejectedValue(new Error('db blip'));

      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' })
      ).resolves.toMatchObject({ canRestore: true });
    });

    it('sends no notice when the request was refused', async () => {
      await expect(
        target.deleteAccount(actor, { businessName: 'Wrong', password: 'pw' })
      ).rejects.toBeDefined();

      expect(notices.notifyScheduled).not.toHaveBeenCalled();
    });

    it('rejects a wrong business name before spending a password attempt', async () => {
      await expect(
        target.deleteAccount(actor, { businessName: 'Acme', password: 'pw' })
      ).rejects.toMatchObject({ response: { code: 'BUSINESS_NAME_MISMATCH' } });
      expect(hashing.compare).not.toHaveBeenCalled();
      expect(authDb['requestTenantErasureBySelf']).not.toHaveBeenCalled();
    });

    it('rejects a wrong password, counting it against the lockout', async () => {
      hashing.compare.mockResolvedValue(false);

      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'nope' })
      ).rejects.toMatchObject({ response: { code: 'INVALID_CURRENT_PASSWORD' } });
      expect(loginAttempts['recordFailure']).toHaveBeenCalled();
      expect(authDb['requestTenantErasureBySelf']).not.toHaveBeenCalled();
    });

    it('does not even compare once the account is locked out', async () => {
      loginAttempts['isLockedOut']!.mockResolvedValue(true);

      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' })
      ).rejects.toMatchObject({ response: { code: 'INVALID_CURRENT_PASSWORD' } });
      expect(authDb['requestTenantErasureBySelf']).not.toHaveBeenCalled();
    });

    it('requires the password from an owner who has one', async () => {
      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', otp: '482913' })
      ).rejects.toMatchObject({ response: { code: 'PASSWORD_REQUIRED' } });
    });

    it('accepts the emailed code from an SSO-only owner, and reports it cannot self-restore', async () => {
      authDb['findUserById']!.mockResolvedValue(ssoOwner);

      const result = await target.deleteAccount(actor, {
        businessName: 'Acme Dental',
        otp: '482913',
      });

      expect(authDb['consumeDeleteAccountOtp']).toHaveBeenCalled();
      expect(result.canRestore).toBe(false);
    });

    it('rejects a wrong code and an exhausted attempt budget', async () => {
      authDb['findUserById']!.mockResolvedValue(ssoOwner);
      authDb['consumeDeleteAccountOtp']!.mockResolvedValue(false);
      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', otp: '000000' })
      ).rejects.toMatchObject({ response: { code: 'INVALID_OTP' } });

      otpAttempts['consumeAttempt']!.mockResolvedValue(false);
      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', otp: '000000' })
      ).rejects.toBeInstanceOf(HttpException);
      expect(authDb['requestTenantErasureBySelf']).not.toHaveBeenCalled();
    });

    it('refuses a business that is already suspended or erased', async () => {
      authDb['findTenantErasureState']!.mockResolvedValue({
        ...activeTenant,
        status: TenantStatus.SUSPENDED,
      });

      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' })
      ).rejects.toMatchObject({ response: { code: 'ACCOUNT_DELETION_NOT_POSSIBLE' } });
    });

    it('still succeeds when stopping the subscription fails', async () => {
      billing['scheduleCancellationForErasure']!.mockRejectedValue(new Error('stripe down'));

      await expect(
        target.deleteAccount(actor, { businessName: 'Acme Dental', password: 'pw' })
      ).resolves.toBeDefined();
    });
  });

  describe('restoreAccount', () => {
    const dto = { email: 'jane@acme.com', password: 'pw' };

    it('cancels the erasure the same owner requested and resumes billing', async () => {
      await expect(target.restoreAccount(dto)).resolves.toHaveProperty('message');

      expect(authDb['cancelSelfRequestedErasure']).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        requestedByUserId: 'user-1',
        gracePeriodDays: 21,
      });
      expect(billing['resumeAfterErasureCancelled']).toHaveBeenCalledWith('tenant-1');
      expect(activity.recordActivityBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({ type: PlatformActivityType.BUSINESS_ERASURE_CANCELLED })
      );
    });

    it('tells the owners the business was restored', async () => {
      await target.restoreAccount(dto);

      expect(notices.notifyCancelled).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        businessName: 'Acme Dental',
      });
    });

    it('answers the one generic 401 for a wrong password, an unknown email, a member, or nothing to restore', async () => {
      hashing.compare.mockResolvedValueOnce(false);
      await expect(target.restoreAccount(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(loginAttempts['recordFailure']).toHaveBeenCalled();

      authDb['findUserForLogin']!.mockResolvedValueOnce(null);
      await expect(target.restoreAccount(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });

      authDb['findUserForLogin']!.mockResolvedValueOnce({ ...owner, role: UserRole.MEMBER });
      await expect(target.restoreAccount(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });

      authDb['cancelSelfRequestedErasure']!.mockResolvedValueOnce(null);
      await expect(target.restoreAccount(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(billing['resumeAfterErasureCancelled']).not.toHaveBeenCalled();
    });

    it('refuses an SSO-only owner, who has no password to prove', async () => {
      authDb['findUserForLogin']!.mockResolvedValue(ssoOwner);

      await expect(target.restoreAccount(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    });

    it('shares the sign-in lockout', async () => {
      loginAttempts['isLockedOut']!.mockResolvedValue(true);

      await expect(target.restoreAccount(dto)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
      expect(authDb['cancelSelfRequestedErasure']).not.toHaveBeenCalled();
    });
  });
});
