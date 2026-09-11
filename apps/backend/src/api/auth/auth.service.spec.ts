import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
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
import { GoogleAuthFailure } from './constants/google-auth.constants';
import { JwtTokenType } from './enums/jwt-token-type.enum';
import { OAuthIntent } from './enums/oauth-intent.enum';
import { TenantStatus } from './enums/tenant-status.enum';
import { UserRole } from './enums/user-role.enum';
import { UserStatus } from './enums/user-status.enum';
import { LoginAttemptService } from './login-attempt.service';
import { OtpAttemptService } from './otp-attempt.service';
import { GoogleIdentityProvider } from './providers/google-identity.provider';
import { VerifyEmailTokenProvider } from './providers/verify-email-token.provider';
import { GoogleOAuthStateService } from './services/google-oauth-state.service';
import { PendingGoogleSignupService } from './services/pending-google-signup.service';
import { TokenService } from './token.service';

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

  const tokenPair = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };

  beforeEach(async () => {
    authDbService = {
      signup: jest.fn(),
      putVerifyEmailToken: jest.fn(),
      verifyEmail: jest.fn(),
      findUserForLogin: jest.fn(),
      findUserById: jest.fn(),
      findTenantStatus: jest.fn(),
      hasConnectedBusiness: jest.fn().mockResolvedValue(false),
      updatePasswordAndRevokeSessions: jest.fn(),
      updateLocale: jest.fn(),
      insertRefreshToken: jest.fn(),
      resolveGoogleIdentity: jest.fn(),
      completeGoogleSignup: jest.fn(),
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
      reissueAccessToken: jest.fn().mockReturnValue({ accessToken: 'new-access', expiresIn: 900 }),
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

    const configService = { get: jest.fn(() => 10) } as unknown as ConfigService;

    googleIdentityProvider = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
      fetchIdentity: jest.fn(),
    } as unknown as jest.Mocked<GoogleIdentityProvider>;

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
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });

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

      expect(authDbService.updatePasswordAndRevokeSessions).toHaveBeenCalledWith(
        'user-1',
        'new-hash'
      );
      expect(tokenService.issueTokenPair).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', tenantId: 'tenant-1' })
      );
      expect(result.body.accessToken).toBe('access');
      expect(result.refreshToken).toBe('refresh');
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

      expect(authDbService.updateLocale).toHaveBeenCalledWith('user-1', 'de');
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

      it('answers 503 rather than failing at boot when the client is unconfigured', async () => {
        googleIdentityProvider.isConfigured.mockReturnValue(false);

        await expect(
          target.buildGoogleAuthorizeRedirect({ intent: OAuthIntent.LOGIN })
        ).rejects.toThrow(MESSAGES.AUTH.GOOGLE_NOT_CONFIGURED);
      });
    });

    describe('callback', () => {
      it('signs in an existing account and normalizes the email first', async () => {
        googleOAuthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.resolveGoogleIdentity.mockResolvedValue({
          kind: 'known',
          user: resolvedUser,
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

        expect(outcome).toEqual({ ok: false, failure: GoogleAuthFailure.INVALID_STATE });
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

        // Keeps the intent so the caller can send an abandoned *signup* back to the signup page
        // rather than to /login, and spends the state either way — it is single-use.
        expect(outcome).toEqual({
          ok: false,
          failure: GoogleAuthFailure.ACCESS_DENIED,
          intent: OAuthIntent.SIGNUP,
        });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('still reports a declined consent when the state is unusable, just without an intent', async () => {
        googleOAuthStateService.consume.mockResolvedValue({ ok: false });

        const outcome = await target.handleGoogleCallback({
          code: undefined,
          state: undefined,
          error: 'access_denied',
          sid: undefined,
        });

        expect(outcome).toEqual({ ok: false, failure: GoogleAuthFailure.ACCESS_DENIED });
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
          intent: OAuthIntent.SIGNUP,
        });
      });

      it('refuses a disabled account, the same standing check password login applies', async () => {
        googleOAuthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.resolveGoogleIdentity.mockResolvedValue({
          kind: 'known',
          user: { ...resolvedUser, status: UserStatus.DISABLED },
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
          intent: OAuthIntent.LOGIN,
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
    });
  });
});
