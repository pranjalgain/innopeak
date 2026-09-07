import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { HashingService } from '@common/hashing/hashing.service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuthService } from './auth.service';
import { TenantStatus } from './enums/tenant-status.enum';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { OtpAttemptService } from './otp-attempt.service';
import { VerifyEmailTokenProvider } from './providers/verify-email-token.provider';
import { TokenService } from './token.service';

describe('AuthService', () => {
  let target: AuthService;
  let authDbService: jest.Mocked<AuthDbService>;
  let hashingService: jest.Mocked<HashingService>;
  let verifyEmailTokenProvider: jest.Mocked<VerifyEmailTokenProvider>;
  let tokenService: jest.Mocked<TokenService>;
  let otpAttemptService: jest.Mocked<OtpAttemptService>;
  let queueManager: jest.Mocked<AddingJobsToQueueManager>;

  const tokenPair = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };

  beforeEach(async () => {
    authDbService = {
      signup: jest.fn(),
      putVerifyEmailToken: jest.fn(),
      verifyEmail: jest.fn(),
      findUserForLogin: jest.fn(),
      findTenantStatus: jest.fn(),
      hasConnectedBusiness: jest.fn().mockResolvedValue(false),
    } as unknown as jest.Mocked<AuthDbService>;

    hashingService = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn(),
    } as unknown as jest.Mocked<HashingService>;

    verifyEmailTokenProvider = {
      generate: jest.fn(() => '482913'),
    } as unknown as jest.Mocked<VerifyEmailTokenProvider>;

    tokenService = {
      issueTokenPair: jest.fn().mockResolvedValue(tokenPair),
      rotate: jest.fn(),
      revokeAll: jest.fn(),
      revokeBySessionToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;

    otpAttemptService = {
      consumeAttempt: jest.fn().mockResolvedValue(true),
      reset: jest.fn(),
    } as unknown as jest.Mocked<OtpAttemptService>;

    queueManager = {
      addRegisterationOtpEmailJob: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AddingJobsToQueueManager>;

    const configService = { get: jest.fn(() => 10) } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthDbService, useValue: authDbService },
        { provide: HashingService, useValue: hashingService },
        { provide: VerifyEmailTokenProvider, useValue: verifyEmailTokenProvider },
        { provide: TokenService, useValue: tokenService },
        { provide: OtpAttemptService, useValue: otpAttemptService },
        { provide: AddingJobsToQueueManager, useValue: queueManager },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('signup', () => {
    const dto = {
      businessName: 'The Coffee House',
      ownerName: 'Jane Doe',
      email: 'Jane@TheCoffeeHouse.com',
      password: 'StrongP@ss1',
    };

    it('throws 409 when the DB service reports the email is already registered', async () => {
      authDbService.signup.mockResolvedValue(null);

      await expect(target.signup(dto)).rejects.toThrow(ConflictException);
      expect(queueManager.addRegisterationOtpEmailJob).not.toHaveBeenCalled();
    });

    it('normalizes the email, hashes the password, and sends the OTP on success', async () => {
      authDbService.signup.mockResolvedValue({
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: UserStatus.PENDING_VERIFICATION,
        ownerName: 'Jane Doe',
      });

      const result = await target.signup(dto);

      expect(authDbService.signup).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@thecoffeehouse.com',
          passwordHash: 'hashed-password',
        })
      );
      expect(queueManager.addRegisterationOtpEmailJob).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ email: 'jane@thecoffeehouse.com', otp: '482913' })
      );
      expect(result.tenantId).toBe('tenant-1');
      expect(result.status).toBe(UserStatus.PENDING_VERIFICATION);
    });
  });

  describe('verifyEmail', () => {
    it('rejects with 429 once the per-account attempt budget is spent, without comparing the code', async () => {
      otpAttemptService.consumeAttempt.mockResolvedValue(false);

      await expect(
        target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '000000' })
      ).rejects.toMatchObject({ status: 429 });
      // never reaches the DB — a locked-out account is not probeable at all
      expect(authDbService.verifyEmail).not.toHaveBeenCalled();
    });

    it('counts the attempt against the normalized email', async () => {
      authDbService.verifyEmail.mockResolvedValue(null);

      await expect(
        target.verifyEmail({ email: '  JANE@thecoffeehouse.com ', otp: '000000' })
      ).rejects.toThrow();
      expect(otpAttemptService.consumeAttempt).toHaveBeenCalledWith('jane@thecoffeehouse.com');
    });

    it('clears the attempt budget after a correct code', async () => {
      authDbService.verifyEmail.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        name: 'Jane Doe',
        role: UserRole.OWNER,
      });

      await target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '482913' });

      expect(otpAttemptService.reset).toHaveBeenCalledWith('jane@thecoffeehouse.com');
    });

    it('leaves the budget spent after a wrong code', async () => {
      authDbService.verifyEmail.mockResolvedValue(null);

      await expect(
        target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '000000' })
      ).rejects.toThrow();
      expect(otpAttemptService.reset).not.toHaveBeenCalled();
    });

    it('throws 400 when the DB service can not verify the code', async () => {
      authDbService.verifyEmail.mockResolvedValue(null);

      await expect(
        target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '000000' })
      ).rejects.toThrow('Invalid or expired verification code.');
    });

    it('issues a token pair on success', async () => {
      authDbService.verifyEmail.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        name: 'Jane Doe',
        role: UserRole.OWNER,
      });

      const result = await target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '482913' });

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', tenantId: 'tenant-1' })
      );
      expect(result.body.accessToken).toBe('access');
      expect(result.body.user.email).toBe('jane@thecoffeehouse.com');
      expect(result.body.hasConnectedBusiness).toBe(false);
      expect(result.refreshToken).toBe('refresh');
    });
  });

  describe('login', () => {
    const activeUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      name: 'Jane Doe',
      email: 'jane@thecoffeehouse.com',
      passwordHash: 'hashed-password',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
    };

    it('throws 401 when no user exists at that email', async () => {
      authDbService.findUserForLogin.mockResolvedValue(null);

      await expect(target.login({ email: 'nobody@example.com', password: 'x' })).rejects.toThrow(
        UnauthorizedException
      );
    });

    // Guards the timing-oracle fix: an unknown email must still cost a real password comparison,
    // otherwise response latency alone distinguishes registered from unregistered addresses.
    it('still performs a password comparison when no account matched', async () => {
      authDbService.findUserForLogin.mockResolvedValue(null);

      await expect(target.login({ email: 'nobody@example.com', password: 'x' })).rejects.toThrow(
        UnauthorizedException
      );
      expect(hashingService.compare).toHaveBeenCalledWith('x', expect.any(String));
    });

    it('reuses one decoy hash across repeated misses instead of hashing per request', async () => {
      authDbService.findUserForLogin.mockResolvedValue(null);

      await expect(target.login({ email: 'a@example.com', password: 'x' })).rejects.toThrow();
      await expect(target.login({ email: 'b@example.com', password: 'x' })).rejects.toThrow();

      expect(hashingService.hash).toHaveBeenCalledTimes(1);
    });

    it('throws 401 for an SSO-only account with no password hash', async () => {
      authDbService.findUserForLogin.mockResolvedValue({ ...activeUser, passwordHash: null });

      await expect(target.login({ email: activeUser.email, password: 'x' })).rejects.toThrow(
        UnauthorizedException
      );
      // Deliberately still compares (against the decoy): an SSO-only account must be
      // indistinguishable by response time from a password account with a wrong password,
      // otherwise latency reveals which addresses are SSO-only. It just can never match, since
      // the decoy hashes a value nobody knows.
      expect(hashingService.compare).toHaveBeenCalledTimes(1);
    });

    it('throws 401 when the password does not match', async () => {
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(false);

      await expect(target.login({ email: activeUser.email, password: 'wrong' })).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('throws 403 for a disabled account', async () => {
      authDbService.findUserForLogin.mockResolvedValue({
        ...activeUser,
        status: UserStatus.DISABLED,
      });
      hashingService.compare.mockResolvedValue(true);

      await expect(
        target.login({ email: activeUser.email, password: 'StrongP@ss1' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 403 for a suspended tenant', async () => {
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({ status: TenantStatus.SUSPENDED });

      await expect(
        target.login({ email: activeUser.email, password: 'StrongP@ss1' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('reissues an OTP and returns a pending_verification result, not tokens, for an unverified account', async () => {
      authDbService.findUserForLogin.mockResolvedValue({
        ...activeUser,
        status: UserStatus.PENDING_VERIFICATION,
      });
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({ status: TenantStatus.ACTIVE });

      const result = await target.login({ email: activeUser.email, password: 'StrongP@ss1' });

      expect(result).toMatchObject({
        status: UserStatus.PENDING_VERIFICATION,
        email: activeUser.email,
      });
      expect(authDbService.putVerifyEmailToken).toHaveBeenCalledWith(
        activeUser.id,
        expect.any(String),
        expect.any(String)
      );
      expect(queueManager.addRegisterationOtpEmailJob).toHaveBeenCalled();
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('issues a token pair for a correct password on an active account', async () => {
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({ status: TenantStatus.ACTIVE });

      const result = await target.login({ email: activeUser.email, password: 'StrongP@ss1' });

      expect('refreshToken' in result && result.body.accessToken).toBe('access');
    });
  });

  describe('refresh', () => {
    it('delegates to TokenService.rotate and shapes the response', async () => {
      tokenService.rotate.mockResolvedValue({
        tokens: tokenPair,
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'jane@thecoffeehouse.com',
          role: UserRole.OWNER,
          name: 'Jane Doe',
        },
      });

      const result = await target.refresh('raw-refresh');

      expect(tokenService.rotate).toHaveBeenCalledWith('raw-refresh');
      expect(result.body.accessToken).toBe('access');
      expect(result.body.user.name).toBe('Jane Doe');
      expect(result.refreshToken).toBe('refresh');
    });
  });

  describe('resendOtp', () => {
    it('issues a fresh OTP for a pending_verification account but still returns the generic acknowledgement', async () => {
      authDbService.findUserForLogin.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        name: 'Jane Doe',
        email: 'jane@thecoffeehouse.com',
        passwordHash: 'hashed-password',
        role: UserRole.OWNER,
        status: UserStatus.PENDING_VERIFICATION,
      });

      const result = await target.resendOtp({ email: 'jane@thecoffeehouse.com' });

      expect(authDbService.putVerifyEmailToken).toHaveBeenCalledWith(
        'user-1',
        expect.any(String),
        expect.any(String)
      );
      expect(queueManager.addRegisterationOtpEmailJob).toHaveBeenCalled();
      expect(result.message).toBeTruthy();
    });

    it('returns the same generic acknowledgement without issuing anything for an unknown or already-active email', async () => {
      authDbService.findUserForLogin.mockResolvedValue(null);

      const result = await target.resendOtp({ email: 'nobody@example.com' });

      expect(authDbService.putVerifyEmailToken).not.toHaveBeenCalled();
      expect(queueManager.addRegisterationOtpEmailJob).not.toHaveBeenCalled();
      expect(result.message).toBeTruthy();
    });
  });

  describe('logout', () => {
    it('revokes every session belonging to the presented refresh token', async () => {
      const result = await target.logout('raw-refresh-token');

      expect(tokenService.revokeBySessionToken).toHaveBeenCalledWith('raw-refresh-token');
      expect(result.message).toBeTruthy();
    });

    // The whole point of driving logout off the refresh cookie: it must still succeed when the
    // access token has expired, and when the cookie is already gone.
    it('succeeds without revoking anything when no refresh cookie was sent', async () => {
      const result = await target.logout(undefined);

      expect(tokenService.revokeBySessionToken).not.toHaveBeenCalled();
      expect(result.message).toBeTruthy();
    });
  });
});
