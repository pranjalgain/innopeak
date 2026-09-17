import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { DemoDataDbService } from '@db/repositories/demo-data/demo-data.db-service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuthService } from './auth.service';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import { LoginAttemptService } from './login-attempt.service';
import { OtpAttemptService } from './otp-attempt.service';
import { PendingGoogleSignupService } from './pending-google-signup.service';
import { TokenService } from './token.service';

import { GOOGLE_AUTH_REDIRECT, GoogleAuthFailure } from '../constants/google-auth.constants';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { PlatformAdminStatus } from '../enums/platform-admin-status.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import { VerifyEmailTokenProvider } from '../providers/verify-email-token.provider';

describe('AuthService', () => {
  let target: AuthService;
  let googleIdentityProvider: jest.Mocked<GoogleIdentityProvider>;
  let googleOAuthStateService: jest.Mocked<GoogleOAuthStateService>;
  let pendingGoogleSignupService: jest.Mocked<PendingGoogleSignupService>;
  let authDbService: jest.Mocked<AuthDbService>;
  let hashingService: jest.Mocked<HashingService>;
  let verifyEmailTokenProvider: jest.Mocked<VerifyEmailTokenProvider>;
  let tokenService: jest.Mocked<TokenService>;
  let otpAttemptService: jest.Mocked<OtpAttemptService>;
  let loginAttemptService: jest.Mocked<LoginAttemptService>;
  let queueManager: jest.Mocked<AddingJobsToQueueManager>;
  let demoDataDbService: jest.Mocked<DemoDataDbService>;
  let platformAdminDbService: jest.Mocked<PlatformAdminDbService>;

  const tokenPair = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };

  beforeEach(async () => {
    authDbService = {
      signup: jest.fn(),
      putVerifyEmailToken: jest.fn(),
      verifyEmail: jest.fn(),
      findUserForLogin: jest.fn(),
      findPlatformAdminForLogin: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn(),
      findTenantStatus: jest.fn(),
      hasConnectedBusiness: jest.fn().mockResolvedValue(false),
      updatePasswordAndRevokeSessions: jest.fn(),
      updateLocale: jest.fn(),
      putSetPasswordOtp: jest.fn(),
      consumeSetPasswordOtp: jest.fn().mockResolvedValue(true),
      insertRefreshToken: jest.fn(),
      resolveGoogleIdentity: jest.fn(),
      completeGoogleSignup: jest.fn(),
    } as unknown as jest.Mocked<AuthDbService>;

    hashingService = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn(),
    };

    verifyEmailTokenProvider = {
      generate: jest.fn(() => '482913'),
    };

    tokenService = {
      issueTokenPair: jest.fn().mockResolvedValue(tokenPair),
      reissueAccessToken: jest.fn().mockReturnValue({ accessToken: 'new-access', expiresIn: 900 }),
      signPlatformAdminAccessToken: jest
        .fn()
        .mockReturnValue({ accessToken: 'admin-access', expiresIn: 900 }),
      rotate: jest.fn(),
      revokeAll: jest.fn(),
      revokeBySessionToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;

    otpAttemptService = {
      consumeAttempt: jest.fn().mockResolvedValue(true),
      reset: jest.fn(),
      // Defaults to "claim granted" so existing OTP-issuing tests are unaffected by the cooldown.
      claimResend: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<OtpAttemptService>;

    loginAttemptService = {
      isLockedOut: jest.fn().mockResolvedValue(false),
      recordFailure: jest.fn(),
      reset: jest.fn(),
    } as unknown as jest.Mocked<LoginAttemptService>;

    queueManager = {
      addRegisterationOtpEmailJob: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AddingJobsToQueueManager>;

    // Fire-and-forget dev-only seeding (`seedDemoDataIfDev`) — `NODE_ENV=test` is not production,
    // so this path runs in every `verifyEmail` test too. Resolved, never asserted on: none of the
    // tests here care about it, only that it can't throw synchronously or block the real result.
    demoDataDbService = {
      seedForTenant: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<DemoDataDbService>;

    platformAdminDbService = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findByGoogleIdentity: jest.fn().mockResolvedValue(null),
      findInviteEmailByTokenHash: jest.fn(),
      acceptInviteWithPassword: jest.fn(),
      acceptInviteWithGoogleIdentity: jest.fn(),
    } as unknown as jest.Mocked<PlatformAdminDbService>;

    const configService = {
      get: jest.fn((key: string) => (key === 'FRONTEND_URL' ? 'https://app.innopeak.test' : 10)),
    } as unknown as ConfigService;

    googleIdentityProvider = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
      fetchIdentity: jest.fn(),
    };

    googleOAuthStateService = {
      mint: jest.fn().mockResolvedValue({ state: 'signed-state', sid: 'raw-sid' }),
      consume: jest.fn(),
    } as unknown as jest.Mocked<GoogleOAuthStateService>;

    pendingGoogleSignupService = {
      mint: jest.fn().mockResolvedValue('pending-nonce'),
      consume: jest.fn(),
    } as unknown as jest.Mocked<PendingGoogleSignupService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthDbService, useValue: authDbService },
        { provide: HashingService, useValue: hashingService },
        { provide: VerifyEmailTokenProvider, useValue: verifyEmailTokenProvider },
        { provide: TokenService, useValue: tokenService },
        { provide: OtpAttemptService, useValue: otpAttemptService },
        { provide: LoginAttemptService, useValue: loginAttemptService },
        { provide: AddingJobsToQueueManager, useValue: queueManager },
        { provide: ConfigService, useValue: configService },
        { provide: GoogleIdentityProvider, useValue: googleIdentityProvider },
        { provide: GoogleOAuthStateService, useValue: googleOAuthStateService },
        { provide: PendingGoogleSignupService, useValue: pendingGoogleSignupService },
        { provide: DemoDataDbService, useValue: demoDataDbService },
        { provide: PlatformAdminDbService, useValue: platformAdminDbService },
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

    /**
     * The mirror of `AdminSettingsService.sendInvite`'s guard. Without it the two identity tables
     * could hold the same email, and `login` resolves an email to exactly one of them — so the
     * tenant account this would have created was unreachable forever (verified by OTP, active,
     * and still 401 on every login). Keyed on `passwordHash` being set — see the invited-admin
     * test below for why a mere row match isn't enough.
     */
    it('refuses an email that already belongs to a loggable-in platform admin, before creating anything', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue({
        id: 'admin-1',
        email: 'jane@thecoffeehouse.com',
        passwordHash: 'hash',
        status: PlatformAdminStatus.ACTIVE,
      });

      await expect(target.signup(dto)).rejects.toThrow(ConflictException);
      expect(authDbService.signup).not.toHaveBeenCalled();
      expect(queueManager.addRegisterationOtpEmailJob).not.toHaveBeenCalled();
    });

    /** The generic message, so public signup can't be used to enumerate admin addresses. */
    it('uses the same message as a duplicate tenant email, not an admin-specific one', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue({
        id: 'admin-1',
        email: 'jane@thecoffeehouse.com',
        passwordHash: 'hash',
        status: PlatformAdminStatus.ACTIVE,
      });

      await expect(target.signup(dto)).rejects.toThrow(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
    });

    /**
     * Now that `acceptAdminInvite`/`completeAdminInviteGoogle` exist, a live (unexpired) invite IS
     * this address's own way in — accepting it, not signing up as a tenant, is the correct path.
     * Allowing both to complete would leave one email resolving to two authenticatable identities,
     * the exact invariant this guard protects. See the lapsed-invite test below for the one case
     * that's still allowed.
     */
    it('refuses a tenant signup for an email with a live, unaccepted platform-admin invite', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue({
        id: 'admin-1',
        email: 'jane@thecoffeehouse.com',
        passwordHash: null,
        status: PlatformAdminStatus.INVITED,
      });
      platformAdminDbService.findByEmail.mockResolvedValue({
        id: 'admin-1',
        status: PlatformAdminStatus.INVITED,
        inviteExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });

      await expect(target.signup(dto)).rejects.toThrow(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
      expect(authDbService.signup).not.toHaveBeenCalled();
    });

    /**
     * A lapsed invite is not a live claim on anything — same "lapsed" definition
     * `AdminSettingsService.sendInvite` already uses for reuse — so it must not permanently block
     * an address nobody ever finished inviting.
     */
    it('allows a tenant signup for an email whose platform-admin invite has expired', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue({
        id: 'admin-1',
        email: 'jane@thecoffeehouse.com',
        passwordHash: null,
        status: PlatformAdminStatus.INVITED,
      });
      platformAdminDbService.findByEmail.mockResolvedValue({
        id: 'admin-1',
        status: PlatformAdminStatus.INVITED,
        inviteExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      });
      authDbService.signup.mockResolvedValue({
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: UserStatus.PENDING_VERIFICATION,
        ownerName: 'Jane Doe',
      });

      await expect(target.signup(dto)).resolves.toMatchObject({ tenantId: 'tenant-1' });
      expect(authDbService.signup).toHaveBeenCalled();
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
        passwordHash: 'hashed-password',
        status: UserStatus.ACTIVE,
        locale: null,
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
      ).rejects.toThrow(MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP);
    });

    it('issues a token pair on success', async () => {
      authDbService.verifyEmail.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        name: 'Jane Doe',
        role: UserRole.OWNER,
        passwordHash: 'hashed-password',
        status: UserStatus.ACTIVE,
        locale: null,
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

    describe('dev demo data seeding — see seedDemoDataIfDev', () => {
      const verifiedUser = {
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        name: 'Jane Doe',
        role: UserRole.OWNER,
        passwordHash: 'hashed-password',
        status: UserStatus.ACTIVE,
        locale: null,
      };

      it('seeds demo data for the newly-activated tenant, keyed off its business name', async () => {
        authDbService.verifyEmail.mockResolvedValue(verifiedUser);
        authDbService.findTenantStatus.mockResolvedValue({
          status: TenantStatus.ACTIVE,
          name: 'The Coffee House',
        });

        await target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '482913' });
        // Fire-and-forget: give the un-awaited seeding chain a turn to run.
        await new Promise(resolve => setImmediate(resolve));

        expect(demoDataDbService.seedForTenant).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          userId: 'user-1',
          businessName: 'The Coffee House',
        });
      });

      it('does not attempt to seed when the tenant lookup comes back empty', async () => {
        authDbService.verifyEmail.mockResolvedValue(verifiedUser);
        authDbService.findTenantStatus.mockResolvedValue(null);

        await target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '482913' });
        await new Promise(resolve => setImmediate(resolve));

        expect(demoDataDbService.seedForTenant).not.toHaveBeenCalled();
      });

      it('never lets a seeding failure surface as a failed verify-email response', async () => {
        authDbService.verifyEmail.mockResolvedValue(verifiedUser);
        authDbService.findTenantStatus.mockResolvedValue({
          status: TenantStatus.ACTIVE,
          name: 'The Coffee House',
        });
        demoDataDbService.seedForTenant.mockRejectedValue(new Error('seed failed'));

        // The awaited result is what the real signup response depends on — it must resolve
        // normally regardless of what the un-awaited seeding call does afterward.
        await expect(
          target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '482913' })
        ).resolves.toMatchObject({ body: { accessToken: 'access' } });
      });
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
      locale: null,
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
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
      });

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
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });

      const result = await target.login({ email: activeUser.email, password: 'StrongP@ss1' });

      expect(result).toMatchObject({
        status: UserStatus.PENDING_VERIFICATION,
        email: activeUser.email,
      });
      expect(authDbService.putVerifyEmailToken).toHaveBeenCalledWith({
        userId: activeUser.id,
        tokenHash: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(queueManager.addRegisterationOtpEmailJob).toHaveBeenCalled();
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('issues a token pair for a correct password on an active account', async () => {
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });

      const result = await target.login({ email: activeUser.email, password: 'StrongP@ss1' });

      expect('refreshToken' in result && result.body.accessToken).toBe('access');
    });
  });

  describe('login — platform admin', () => {
    const activeAdmin = {
      id: 'admin-1',
      email: 'admin@innopeak.com',
      passwordHash: 'hashed-admin-password',
      status: PlatformAdminStatus.ACTIVE,
    };

    it('takes precedence over a colliding tenant-user email — the tenant table is never consulted', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue(activeAdmin);
      hashingService.compare.mockResolvedValue(true);

      await target.login({ email: activeAdmin.email, password: 'StrongP@ss1' });

      expect(authDbService.findUserForLogin).not.toHaveBeenCalled();
    });

    it('issues a platform-admin access token for a correct password on an active admin', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue(activeAdmin);
      hashingService.compare.mockResolvedValue(true);

      const result = await target.login({ email: activeAdmin.email, password: 'StrongP@ss1' });

      expect(result).toEqual({
        admin: true,
        body: {
          accessToken: 'admin-access',
          expiresIn: 900,
          admin: { id: 'admin-1', email: activeAdmin.email },
        },
      });
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('throws 401 when the password does not match, still paying for a real comparison', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue(activeAdmin);
      hashingService.compare.mockResolvedValue(false);

      await expect(target.login({ email: activeAdmin.email, password: 'wrong' })).rejects.toThrow(
        UnauthorizedException
      );
      expect(hashingService.compare).toHaveBeenCalledWith('wrong', activeAdmin.passwordHash);
    });

    it('throws 401 for an invited admin with no password set yet, same message as a wrong password', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue({
        ...activeAdmin,
        passwordHash: null,
        status: PlatformAdminStatus.INVITED,
      });

      await expect(target.login({ email: activeAdmin.email, password: 'x' })).rejects.toThrow(
        UnauthorizedException
      );
      // Exactly one comparison either way: this now falls through to the tenant branch, which pays
      // for the decoy when no user matches. An invited admin stays indistinguishable by timing
      // from an active one with a wrong password.
      expect(hashingService.compare).toHaveBeenCalledTimes(1);
    });

    /**
     * The un-shadowing case. An invite that nobody accepted has no `password_hash` and so can
     * never authenticate as an admin — but it used to claim the email anyway, which permanently
     * locked out the real tenant account sitting behind it (sign up, verify by OTP, then 401 on
     * every login, forever, with no way to tell why).
     */
    it('falls through to the tenant user when the admin row has no password to check', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue({
        ...activeAdmin,
        passwordHash: null,
        status: PlatformAdminStatus.INVITED,
      });
      authDbService.findUserForLogin.mockResolvedValue({
        id: 'user-1',
        tenantId: 'tenant-1',
        email: activeAdmin.email,
        role: UserRole.OWNER,
        name: 'Jane Doe',
        status: UserStatus.ACTIVE,
        passwordHash: 'hashed-password',
        locale: null,
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'The Coffee House',
      });
      hashingService.compare.mockResolvedValue(true);

      const result = await target.login({ email: activeAdmin.email, password: 'StrongP@ss1' });

      expect(result).not.toHaveProperty('admin');
      expect(tokenService.issueTokenPair).toHaveBeenCalled();
    });

    it('throws 403 for a disabled admin who still remembers the right password', async () => {
      authDbService.findPlatformAdminForLogin.mockResolvedValue({
        ...activeAdmin,
        status: PlatformAdminStatus.DISABLED,
      });
      hashingService.compare.mockResolvedValue(true);

      await expect(
        target.login({ email: activeAdmin.email, password: 'StrongP@ss1' })
      ).rejects.toThrow(ForbiddenException);
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
          passwordHash: 'hashed-password',
          locale: null,
        },
        tenant: { status: TenantStatus.ACTIVE, name: 'Test Tenant' },
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
        locale: null,
      });

      const result = await target.resendOtp({ email: 'jane@thecoffeehouse.com' });

      expect(authDbService.putVerifyEmailToken).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(String),
      });
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

  describe('changePassword', () => {
    const tenantUser = {
      type: JwtTokenType.TENANT_USER as const,
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'jane@thecoffeehouse.com',
      role: UserRole.OWNER as const,
      locale: null,
    };
    const storedUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      name: 'Jane Doe',
      email: 'jane@thecoffeehouse.com',
      passwordHash: 'hashed-password',
      role: UserRole.OWNER as const,
      status: UserStatus.ACTIVE as const,
      locale: null,
    };
    const dto = { currentPassword: 'StrongP@ss1', newPassword: 'NewStr0ng@Pass' };

    it('rejects a platform-admin token without looking up a user', async () => {
      await expect(
        target.changePassword(
          { type: JwtTokenType.PLATFORM_ADMIN, id: 'admin-1', email: 'a@x.com' },
          dto
        )
      ).rejects.toThrow(ForbiddenException);
      expect(authDbService.findUserById).not.toHaveBeenCalled();
    });

    it('rejects an SSO-only account with no password hash', async () => {
      authDbService.findUserById.mockResolvedValue({ ...storedUser, passwordHash: null });

      await expect(target.changePassword(tenantUser, dto)).rejects.toThrow(BadRequestException);
      expect(authDbService.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
    });

    it('rejects a wrong current password without writing a new hash', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(false);

      await expect(target.changePassword(tenantUser, dto)).rejects.toThrow(UnauthorizedException);
      expect(authDbService.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
    });

    it('updates the hash, revokes other sessions, and issues a fresh pair', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(true);
      hashingService.hash.mockResolvedValue('new-hash');

      const result = await target.changePassword(tenantUser, dto);

      expect(authDbService.updatePasswordAndRevokeSessions).toHaveBeenCalledWith({
        userId: 'user-1',
        passwordHash: 'new-hash',
      });
      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', tenantId: 'tenant-1' })
      );
      expect(result.body.accessToken).toBe('access');
      expect(result.refreshToken).toBe('refresh');
    });
  });

  describe('setPassword', () => {
    const tenantUser = {
      type: JwtTokenType.TENANT_USER as const,
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'jane@thecoffeehouse.com',
      role: UserRole.OWNER as const,
      locale: null,
    };
    const passwordlessUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      name: 'Jane Doe',
      email: 'jane@thecoffeehouse.com',
      passwordHash: null,
      role: UserRole.OWNER as const,
      status: UserStatus.ACTIVE as const,
      locale: null,
    };

    /**
     * The regression this guards: a stolen access token alone used to be sufficient to call
     * `setPassword` on a Google-only account, turning a 15-minute credential into a permanent
     * one. `otp` must now be checked against a freshly-issued, purpose-scoped code before the
     * password is ever hashed or written.
     */
    it('rejects when the OTP does not match a live set-password code', async () => {
      authDbService.findUserById.mockResolvedValue(passwordlessUser);
      authDbService.consumeSetPasswordOtp.mockResolvedValue(false);

      await expect(
        target.setPassword(tenantUser, { newPassword: 'NewStr0ng@Pass', otp: '000000' })
      ).rejects.toThrow(MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP);

      expect(authDbService.consumeSetPasswordOtp).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: expect.any(String),
      });
      expect(authDbService.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
      expect(hashingService.hash).not.toHaveBeenCalled();
    });

    it('rejects an exhausted OTP attempt budget without ever checking the code', async () => {
      authDbService.findUserById.mockResolvedValue(passwordlessUser);
      otpAttemptService.consumeAttempt.mockResolvedValue(false);

      await expect(
        target.setPassword(tenantUser, { newPassword: 'NewStr0ng@Pass', otp: '000000' })
      ).rejects.toThrow(MESSAGES.AUTH.TOO_MANY_OTP_ATTEMPTS);

      expect(authDbService.consumeSetPasswordOtp).not.toHaveBeenCalled();
    });

    it('sets the password once the OTP is valid, and still refuses an account that already has one', async () => {
      authDbService.findUserById.mockResolvedValue(passwordlessUser);
      authDbService.consumeSetPasswordOtp.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'The Coffee House',
      });

      await target.setPassword(tenantUser, { newPassword: 'NewStr0ng@Pass', otp: '482913' });

      expect(authDbService.updatePasswordAndRevokeSessions).toHaveBeenCalledWith({
        userId: 'user-1',
        passwordHash: 'hashed-password',
      });
      expect(otpAttemptService.reset).toHaveBeenCalledWith('jane@thecoffeehouse.com');

      authDbService.findUserById.mockResolvedValue({
        ...passwordlessUser,
        passwordHash: 'already-set',
      });
      await expect(
        target.setPassword(tenantUser, { newPassword: 'NewStr0ng@Pass', otp: '482913' })
      ).rejects.toThrow(MESSAGES.AUTH.PASSWORD_ALREADY_SET);
      expect(authDbService.consumeSetPasswordOtp).toHaveBeenCalledTimes(1);
    });
  });

  describe('requestSetPasswordOtp', () => {
    const tenantUser = {
      type: JwtTokenType.TENANT_USER as const,
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'jane@thecoffeehouse.com',
      role: UserRole.OWNER as const,
      locale: null,
    };
    const passwordlessUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      name: 'Jane Doe',
      email: 'jane@thecoffeehouse.com',
      passwordHash: null,
      role: UserRole.OWNER as const,
      status: UserStatus.ACTIVE as const,
      locale: null,
    };

    it('mails a fresh OTP for a passwordless account', async () => {
      authDbService.findUserById.mockResolvedValue(passwordlessUser);

      const result = await target.requestSetPasswordOtp(tenantUser);

      expect(authDbService.putSetPasswordOtp).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect(result.message).toBe(MESSAGES.AUTH.SET_PASSWORD_OTP_ACK);
    });

    it('rejects an account that already has a password, without sending anything', async () => {
      authDbService.findUserById.mockResolvedValue({
        ...passwordlessUser,
        passwordHash: 'already-set',
      });

      await expect(target.requestSetPasswordOtp(tenantUser)).rejects.toThrow(
        MESSAGES.AUTH.PASSWORD_ALREADY_SET
      );
      expect(authDbService.putSetPasswordOtp).not.toHaveBeenCalled();
    });

    it('silently no-ops within the resend cooldown, same shape as the signup/login OTP', async () => {
      authDbService.findUserById.mockResolvedValue(passwordlessUser);
      otpAttemptService.claimResend.mockResolvedValue(false);

      const result = await target.requestSetPasswordOtp(tenantUser);

      expect(authDbService.putSetPasswordOtp).not.toHaveBeenCalled();
      expect(result.message).toBe(MESSAGES.AUTH.SET_PASSWORD_OTP_ACK);
    });
  });

  describe('updateLocale', () => {
    const tenantUser = {
      type: JwtTokenType.TENANT_USER as const,
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'jane@thecoffeehouse.com',
      role: UserRole.OWNER as const,
      locale: null,
    };
    const storedUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      name: 'Jane Doe',
      email: 'jane@thecoffeehouse.com',
      passwordHash: 'hashed-password',
      role: UserRole.OWNER as const,
      status: UserStatus.ACTIVE as const,
      locale: null,
    };

    it('rejects a platform-admin token without looking up a user', async () => {
      await expect(
        target.updateLocale(
          { type: JwtTokenType.PLATFORM_ADMIN, id: 'admin-1', email: 'a@x.com' },
          { locale: 'de' }
        )
      ).rejects.toThrow(ForbiddenException);
      expect(authDbService.findUserById).not.toHaveBeenCalled();
    });

    /**
     * The regression this guards: `updateLocale` must re-sign only the access token, never mint a
     * refresh token, from a route authenticated by nothing more than the caller's existing access
     * token — `issueTokenPair` (used by every real sign-in event) would otherwise let anyone
     * holding a leaked access token turn it into a fresh, indefinitely-rotatable 7-day session.
     */
    it('persists the locale and reissues only the access token — never a refresh token', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'The Coffee House',
      });

      const result = await target.updateLocale(tenantUser, { locale: 'de' });

      expect(authDbService.updateLocale).toHaveBeenCalledWith({ userId: 'user-1', locale: 'de' });
      expect(tokenService.reissueAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', locale: 'de' })
      );
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
      expect(authDbService.insertRefreshToken).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('new-access');
      expect(result.expiresIn).toBe(900);
      expect(result).not.toHaveProperty('refreshToken');
      expect(result.user.locale).toBe('de');
    });

    /**
     * The regression this guards: a disabled user renewing their access token forever by hitting
     * this route every 14 minutes instead of `/v1/auth/refresh` (which does revoke). Before this
     * check, `updateLocale` fetched the tenant row and reissued a token without ever reading
     * `user.status`.
     */
    it('rejects a disabled user rather than reissuing a token', async () => {
      authDbService.findUserById.mockResolvedValue({
        ...storedUser,
        status: UserStatus.DISABLED,
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'The Coffee House',
      });

      await expect(target.updateLocale(tenantUser, { locale: 'de' })).rejects.toThrow(
        MESSAGES.AUTH.ACCOUNT_DISABLED
      );
      expect(authDbService.updateLocale).not.toHaveBeenCalled();
      expect(tokenService.reissueAccessToken).not.toHaveBeenCalled();
    });

    it('rejects a member of a suspended tenant rather than reissuing a token', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'The Coffee House',
      });

      await expect(target.updateLocale(tenantUser, { locale: 'de' })).rejects.toThrow(
        MESSAGES.AUTH.TENANT_SUSPENDED
      );
      expect(authDbService.updateLocale).not.toHaveBeenCalled();
      expect(tokenService.reissueAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('Google sign-in', () => {
    const identity = {
      providerUserId: 'google-sub-1',
      email: 'Owner@Example.com',
      emailVerified: true,
      name: 'Jane Doe',
    };
    const resolvedUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@example.com',
      name: 'Jane Doe',
      role: UserRole.OWNER,
      passwordHash: null,
      status: UserStatus.ACTIVE,
      locale: null,
    };
    const signupState = {
      ok: true as const,
      record: { intent: OAuthIntent.SIGNUP, sidHash: 'h' },
    };
    const loginState = {
      ok: true as const,
      record: { intent: OAuthIntent.LOGIN, sidHash: 'h' },
    };

    describe('authorize', () => {
      it('mints state for the given intent — no business name travels here any more', async () => {
        await target.buildGoogleAuthorizeRedirect({ intent: OAuthIntent.SIGNUP });

        expect(googleOAuthStateService.mint).toHaveBeenCalledWith({ intent: OAuthIntent.SIGNUP });
      });

      it('answers with a redirect rather than throwing when the client is unconfigured', async () => {
        googleIdentityProvider.isConfigured.mockReturnValue(false);

        const redirect = await target.buildGoogleAuthorizeRedirect({ intent: OAuthIntent.LOGIN });

        expect(redirect).toEqual({
          ok: false,
          redirectUrl: `${GOOGLE_AUTH_REDIRECT.LOGIN}?error=${GoogleAuthFailure.NOT_CONFIGURED}`,
        });
      });
    });

    describe('callback', () => {
      it('signs in an existing account and normalizes the email first', async () => {
        googleOAuthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.resolveGoogleIdentity.mockResolvedValue({
          kind: 'known',
          user: resolvedUser,
          firstActivation: false,
        });
        authDbService.findTenantStatus.mockResolvedValue({
          status: TenantStatus.ACTIVE,
          name: 'Test Tenant',
        });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toMatchObject({ ok: true, kind: 'signed_in' });
        expect(authDbService.resolveGoogleIdentity).toHaveBeenCalledWith(
          expect.objectContaining({ email: 'owner@example.com' })
        );
      });

      it('consumes the state before exchanging the code, so a replay costs no round trip', async () => {
        googleOAuthStateService.consume.mockResolvedValue({ ok: false });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 'replayed',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toEqual({
          ok: false,
          failure: GoogleAuthFailure.INVALID_STATE,
          redirectUrl: `${GOOGLE_AUTH_REDIRECT.LOGIN}?error=${GoogleAuthFailure.INVALID_STATE}`,
        });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('refuses an email Google has not verified', async () => {
        googleOAuthStateService.consume.mockResolvedValue(signupState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue({
          ...identity,
          emailVerified: false,
        });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toMatchObject({ failure: GoogleAuthFailure.EMAIL_NOT_VERIFIED });
        expect(authDbService.resolveGoogleIdentity).not.toHaveBeenCalled();
      });

      it('returns NO_ACCOUNT rather than starting a pending signup on a login', async () => {
        googleOAuthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.resolveGoogleIdentity.mockResolvedValue({ kind: 'unknown' });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toMatchObject({ failure: GoogleAuthFailure.NO_ACCOUNT });
        expect(pendingGoogleSignupService.mint).not.toHaveBeenCalled();
      });

      it('mints a pending signup rather than a tenant for a genuinely new signup', async () => {
        googleOAuthStateService.consume.mockResolvedValue(signupState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.resolveGoogleIdentity.mockResolvedValue({ kind: 'unknown' });
        pendingGoogleSignupService.mint.mockResolvedValue('pending-nonce');

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toEqual({
          ok: true,
          kind: 'needs_business_name',
          pendingSignupCookie: 'pending-nonce',
        });
        expect(pendingGoogleSignupService.mint).toHaveBeenCalledWith({
          providerUserId: 'google-sub-1',
          email: 'owner@example.com',
          name: 'Jane Doe',
        });
        expect(authDbService.findTenantStatus).not.toHaveBeenCalled();
      });

      it('reports a declined consent without calling Google at all', async () => {
        googleOAuthStateService.consume.mockResolvedValue(signupState);

        const outcome = await target.handleGoogleCallback({
          code: undefined,
          state: 's',
          error: 'access_denied',
          sid: 'sid',
        });

        // Keeps the signup-page redirect so the caller can send an abandoned *signup* back there
        // rather than to /login, and spends the state either way — it is single-use.
        expect(outcome).toEqual({
          ok: false,
          failure: GoogleAuthFailure.ACCESS_DENIED,
          redirectUrl: `${GOOGLE_AUTH_REDIRECT.SIGNUP}?error=${GoogleAuthFailure.ACCESS_DENIED}`,
        });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('still reports a declined consent when the state is unusable, falling back to the login page', async () => {
        googleOAuthStateService.consume.mockResolvedValue({ ok: false });

        const outcome = await target.handleGoogleCallback({
          code: undefined,
          state: undefined,
          error: 'access_denied',
          sid: undefined,
        });

        expect(outcome).toEqual({
          ok: false,
          failure: GoogleAuthFailure.ACCESS_DENIED,
          redirectUrl: `${GOOGLE_AUTH_REDIRECT.LOGIN}?error=${GoogleAuthFailure.ACCESS_DENIED}`,
        });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('maps a provider failure to a redirect rather than throwing mid-navigation', async () => {
        googleOAuthStateService.consume.mockResolvedValue(signupState);
        googleIdentityProvider.fetchIdentity.mockRejectedValue(new Error('google is down'));

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toMatchObject({
          failure: GoogleAuthFailure.PROVIDER_ERROR,
          redirectUrl: `${GOOGLE_AUTH_REDIRECT.SIGNUP}?error=${GoogleAuthFailure.PROVIDER_ERROR}`,
        });
      });

      it('refuses a disabled account, the same standing check password login applies', async () => {
        googleOAuthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.resolveGoogleIdentity.mockResolvedValue({
          kind: 'known',
          user: { ...resolvedUser, status: UserStatus.DISABLED },
          firstActivation: false,
        });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toEqual({
          ok: false,
          failure: GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
          redirectUrl: `${GOOGLE_AUTH_REDIRECT.LOGIN}?error=${GoogleAuthFailure.ACCOUNT_UNAVAILABLE}`,
        });
        // Refused before any token is minted — not merely revoked on the next refresh.
        expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
      });

      it('refuses a suspended tenant even though the identity is valid', async () => {
        googleOAuthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.resolveGoogleIdentity.mockResolvedValue({
          kind: 'known',
          user: resolvedUser,
          firstActivation: false,
        });
        authDbService.findTenantStatus.mockResolvedValue({
          status: TenantStatus.SUSPENDED,
          name: 'Test Tenant',
        });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toMatchObject({ failure: GoogleAuthFailure.ACCOUNT_UNAVAILABLE });
      });

      describe('dev demo data seeding — the Google-linking equivalent of verifyEmail', () => {
        it('seeds demo data when the callback just promoted a pending_verification row', async () => {
          googleOAuthStateService.consume.mockResolvedValue(loginState);
          googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
          authDbService.resolveGoogleIdentity.mockResolvedValue({
            kind: 'known',
            user: resolvedUser,
            firstActivation: true,
          });
          authDbService.findTenantStatus.mockResolvedValue({
            status: TenantStatus.ACTIVE,
            name: 'Test Tenant',
          });

          await target.handleGoogleCallback({
            code: 'c',
            state: 's',
            error: undefined,
            sid: 'sid',
          });
          await new Promise(resolve => setImmediate(resolve));

          expect(demoDataDbService.seedForTenant).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            userId: 'user-1',
            businessName: 'Test Tenant',
          });
        });

        it('does not seed for a returning user signing back in — firstActivation is false', async () => {
          googleOAuthStateService.consume.mockResolvedValue(loginState);
          googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
          authDbService.resolveGoogleIdentity.mockResolvedValue({
            kind: 'known',
            user: resolvedUser,
            firstActivation: false,
          });
          authDbService.findTenantStatus.mockResolvedValue({
            status: TenantStatus.ACTIVE,
            name: 'Test Tenant',
          });

          await target.handleGoogleCallback({
            code: 'c',
            state: 's',
            error: undefined,
            sid: 'sid',
          });
          await new Promise(resolve => setImmediate(resolve));

          expect(demoDataDbService.seedForTenant).not.toHaveBeenCalled();
        });
      });
    });

    describe('completeGoogleSignup', () => {
      it('creates the tenant from the pending identity and issues tokens', async () => {
        pendingGoogleSignupService.consume.mockResolvedValue({
          ok: true,
          identity: {
            providerUserId: 'google-sub-1',
            email: 'owner@example.com',
            name: 'Jane Doe',
          },
        });
        authDbService.completeGoogleSignup.mockResolvedValue(resolvedUser);

        const result = await target.completeGoogleSignup('pending-nonce', 'The Coastal Table');

        expect(authDbService.completeGoogleSignup).toHaveBeenCalledWith({
          providerUserId: 'google-sub-1',
          email: 'owner@example.com',
          name: 'Jane Doe',
          businessName: 'The Coastal Table',
        });
        expect(result.body.accessToken).toBe('access');
      });

      it('rejects a missing, expired, or already-consumed pending signup', async () => {
        pendingGoogleSignupService.consume.mockResolvedValue({ ok: false });

        await expect(target.completeGoogleSignup(undefined, 'The Coastal Table')).rejects.toThrow(
          MESSAGES.AUTH.GOOGLE_PENDING_SIGNUP_EXPIRED
        );
        expect(authDbService.completeGoogleSignup).not.toHaveBeenCalled();
      });

      it('reports a conflict when the email was claimed in the meantime', async () => {
        pendingGoogleSignupService.consume.mockResolvedValue({
          ok: true,
          identity: { providerUserId: 'google-sub-1', email: 'owner@example.com', name: null },
        });
        authDbService.completeGoogleSignup.mockResolvedValue(null);

        await expect(
          target.completeGoogleSignup('pending-nonce', 'The Coastal Table')
        ).rejects.toThrow(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
      });

      it('seeds dev demo data unconditionally — this path only ever creates a brand-new tenant', async () => {
        pendingGoogleSignupService.consume.mockResolvedValue({
          ok: true,
          identity: {
            providerUserId: 'google-sub-1',
            email: 'owner@example.com',
            name: 'Jane Doe',
          },
        });
        authDbService.completeGoogleSignup.mockResolvedValue(resolvedUser);
        authDbService.findTenantStatus.mockResolvedValue({
          status: TenantStatus.ACTIVE,
          name: 'The Coastal Table',
        });

        await target.completeGoogleSignup('pending-nonce', 'The Coastal Table');
        await new Promise(resolve => setImmediate(resolve));

        expect(demoDataDbService.seedForTenant).toHaveBeenCalledWith({
          tenantId: 'tenant-1',
          userId: 'user-1',
          businessName: 'The Coastal Table',
        });
      });

      it('never seeds when the email was claimed in the meantime — no tenant was actually created', async () => {
        pendingGoogleSignupService.consume.mockResolvedValue({
          ok: true,
          identity: { providerUserId: 'google-sub-1', email: 'owner@example.com', name: null },
        });
        authDbService.completeGoogleSignup.mockResolvedValue(null);

        await expect(
          target.completeGoogleSignup('pending-nonce', 'The Coastal Table')
        ).rejects.toThrow();
        await new Promise(resolve => setImmediate(resolve));

        expect(demoDataDbService.seedForTenant).not.toHaveBeenCalled();
      });

      /** Same `assertEmailNotAPlatformAdmin` guard as `signup` — shares the one private method. */
      it('refuses an email that already belongs to a loggable-in platform admin', async () => {
        pendingGoogleSignupService.consume.mockResolvedValue({
          ok: true,
          identity: { providerUserId: 'google-sub-1', email: 'owner@example.com', name: null },
        });
        authDbService.findPlatformAdminForLogin.mockResolvedValue({
          id: 'admin-1',
          email: 'owner@example.com',
          passwordHash: 'hash',
          status: PlatformAdminStatus.ACTIVE,
        });

        await expect(
          target.completeGoogleSignup('pending-nonce', 'The Coastal Table')
        ).rejects.toThrow(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
        expect(authDbService.completeGoogleSignup).not.toHaveBeenCalled();
      });
    });
  });

  describe('validateAdminInvite', () => {
    it('returns the invited email for a live token', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });

      const result = await target.validateAdminInvite('raw-token-1');

      expect(result.email).toBe('priya.ops@innopeak.com');
    });

    it('throws 404 for a token that never existed, was used, or has expired', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue(null);

      await expect(target.validateAdminInvite('bad-token')).rejects.toThrow(
        MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE
      );
    });
  });

  describe('acceptAdminInvite', () => {
    it('hashes the password and signs the admin in on success', async () => {
      platformAdminDbService.acceptInviteWithPassword.mockResolvedValue({
        outcome: 'accepted',
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
      });

      const result = await target.acceptAdminInvite({
        token: 'raw-token-1',
        password: 'NewStr0ng@Pass',
      });

      expect(hashingService.hash).toHaveBeenCalledWith('NewStr0ng@Pass');
      expect(result.admin).toBe(true);
      expect(result.body.admin.email).toBe('priya.ops@innopeak.com');
      expect(tokenService.signPlatformAdminAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'admin-1', email: 'priya.ops@innopeak.com' })
      );
    });

    it('throws 400 for a token that never existed, was used, or has expired', async () => {
      platformAdminDbService.acceptInviteWithPassword.mockResolvedValue({ outcome: 'invalid' });

      await expect(
        target.acceptAdminInvite({ token: 'bad-token', password: 'NewStr0ng@Pass' })
      ).rejects.toThrow(MESSAGES.AUTH.INVALID_OR_EXPIRED_INVITE);
    });
  });

  describe('buildAdminInviteGoogleRedirect', () => {
    it('redirects to the accept page with an error, without minting state, for a dead token', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue(null);

      const redirect = await target.buildAdminInviteGoogleRedirect('bad-token');

      expect(redirect).toEqual({
        ok: false,
        redirectUrl: `https://app.innopeak.test/invite/bad-token?error=${GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE}`,
      });
      expect(googleOAuthStateService.mint).not.toHaveBeenCalled();
    });

    it('answers with a redirect rather than throwing when the client is unconfigured', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });
      googleIdentityProvider.isConfigured.mockReturnValue(false);

      const redirect = await target.buildAdminInviteGoogleRedirect('raw-token-1');

      expect(redirect).toEqual({
        ok: false,
        redirectUrl: `https://app.innopeak.test/invite/raw-token-1?error=${GoogleAuthFailure.NOT_CONFIGURED}`,
      });
    });

    it('mints state carrying the ADMIN_INVITE intent and the invite token', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });

      await target.buildAdminInviteGoogleRedirect('raw-token-1');

      expect(googleOAuthStateService.mint).toHaveBeenCalledWith({
        intent: OAuthIntent.ADMIN_INVITE,
        inviteToken: 'raw-token-1',
      });
    });
  });

  describe('Google sign-in — admin invite acceptance', () => {
    const adminInviteState = {
      ok: true as const,
      record: {
        intent: OAuthIntent.ADMIN_INVITE,
        sidHash: 'h',
        inviteToken: 'raw-token-1',
      },
    };
    const identity = {
      providerUserId: 'google-sub-1',
      email: 'Priya.Ops@Innopeak.com',
      emailVerified: true,
      name: 'Priya',
    };

    it('links the identity and signs the admin in when the emails match', async () => {
      googleOAuthStateService.consume.mockResolvedValue(adminInviteState);
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });
      platformAdminDbService.acceptInviteWithGoogleIdentity.mockResolvedValue({
        outcome: 'accepted',
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(platformAdminDbService.acceptInviteWithGoogleIdentity).toHaveBeenCalledWith({
        tokenHash: expect.any(String),
        providerUserId: 'google-sub-1',
      });
      expect(outcome).toMatchObject({ ok: true, kind: 'admin_signed_in' });
    });

    /**
     * The check that stops someone other than the invited person from redeeming this link with
     * their own unrelated Google account — see AuthService.completeAdminInviteGoogle.
     */
    it('rejects a Google account whose verified email does not match the invited address, without linking anything', async () => {
      googleOAuthStateService.consume.mockResolvedValue(adminInviteState);
      googleIdentityProvider.fetchIdentity.mockResolvedValue({
        ...identity,
        email: 'someone-else@innopeak.com',
      });
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.INVITE_EMAIL_MISMATCH,
        redirectUrl: `https://app.innopeak.test/invite/raw-token-1?error=${GoogleAuthFailure.INVITE_EMAIL_MISMATCH}`,
      });
      expect(platformAdminDbService.acceptInviteWithGoogleIdentity).not.toHaveBeenCalled();
    });

    it('reports a Google account already linked to a different admin distinctly from an invalid token', async () => {
      googleOAuthStateService.consume.mockResolvedValue(adminInviteState);
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });
      platformAdminDbService.acceptInviteWithGoogleIdentity.mockResolvedValue({
        outcome: 'identity_already_linked',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED,
      });
    });

    /**
     * The regression this pairs with: nothing in `src/` read `platform_admin_identities` when the
     * acceptance path that writes it was first built, so an admin who accepted through Google
     * could sign in exactly once — no `password_hash`, no refresh token for this principal, and
     * neither revoke nor re-invite available afterwards (both are scoped to `status = 'invited'`).
     */
    it('signs a returning Google-linked admin back in on a plain login round trip', async () => {
      googleOAuthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: { intent: OAuthIntent.LOGIN, sidHash: 'h' },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminDbService.findByGoogleIdentity.mockResolvedValue({
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
        status: PlatformAdminStatus.ACTIVE,
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toMatchObject({ ok: true, kind: 'admin_signed_in' });
      // The admin identity owns the request exclusively — the tenant lookup never runs, same rule
      // password `login` applies by resolving `platform_admins` first.
      expect(authDbService.resolveGoogleIdentity).not.toHaveBeenCalled();
    });

    it('refuses a disabled admin rather than signing them in', async () => {
      googleOAuthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: { intent: OAuthIntent.LOGIN, sidHash: 'h' },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminDbService.findByGoogleIdentity.mockResolvedValue({
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
        status: PlatformAdminStatus.DISABLED,
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.ACCOUNT_UNAVAILABLE,
      });
    });

    /** Wrong button, right answer: an admin-linked account never falls through to tenant signup. */
    it('signs the admin in even under a signup-intent round trip', async () => {
      googleOAuthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: { intent: OAuthIntent.SIGNUP, sidHash: 'h' },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminDbService.findByGoogleIdentity.mockResolvedValue({
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
        status: PlatformAdminStatus.ACTIVE,
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toMatchObject({ ok: true, kind: 'admin_signed_in' });
      expect(pendingGoogleSignupService.mint).not.toHaveBeenCalled();
    });

    it('rejects a dead token before ever looking at the Google identity outcome', async () => {
      googleOAuthStateService.consume.mockResolvedValue(adminInviteState);
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue(null);

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
      });
      expect(platformAdminDbService.acceptInviteWithGoogleIdentity).not.toHaveBeenCalled();
    });
  });
});
