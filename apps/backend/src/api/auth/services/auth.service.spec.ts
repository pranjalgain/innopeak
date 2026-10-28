import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { MediaService } from '@media/media.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuthService } from './auth.service';
import { LoginAttemptScope, LoginAttemptService } from './login-attempt.service';
import { OAuthStateService } from './oauth-state.service';
import { OtpAttemptService } from './otp-attempt.service';
import { PendingSsoSignupService } from './pending-sso-signup.service';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { SessionRevocationService } from './session-revocation.service';
import { SignupBindingService } from './signup-binding.service';
import { TokenService } from './token.service';

import { SSO_REDIRECT, SsoAuthFailure, SsoProvider } from '../constants/sso-auth.constants';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { OtpScope } from '../enums/otp-scope.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import {
  PasswordLoginDisabledException,
  PasswordSignupDisabledException,
} from '../exceptions/auth.exceptions';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';
import { MicrosoftIdentityProvider } from '../providers/microsoft-identity.provider';
import { VerifyEmailTokenProvider } from '../providers/verify-email-token.provider';

const ADMIN_TID = '3f2b8c1e-5a47-4d90-8e6b-0c1d2e3f4a5b';

describe('AuthService', () => {
  let target: AuthService;
  let googleIdentityProvider: jest.Mocked<GoogleIdentityProvider>;
  let microsoftIdentityProvider: jest.Mocked<MicrosoftIdentityProvider>;
  let oauthStateService: jest.Mocked<OAuthStateService>;
  let pendingSsoSignupService: jest.Mocked<PendingSsoSignupService>;
  let authDbService: jest.Mocked<AuthDbService>;
  let hashingService: jest.Mocked<HashingService>;
  let verifyEmailTokenProvider: jest.Mocked<VerifyEmailTokenProvider>;
  let tokenService: jest.Mocked<TokenService>;
  let otpAttemptService: jest.Mocked<OtpAttemptService>;
  let loginAttemptService: jest.Mocked<LoginAttemptService>;
  let queueManager: jest.Mocked<AddingJobsToQueueManager>;
  let platformAdminAuthService: jest.Mocked<PlatformAdminAuthService>;
  let sessionRevocationService: { revokeUser: jest.Mock };
  let signupBindingService: { issue: jest.Mock; matches: jest.Mock };
  let mediaService: jest.Mocked<MediaService>;
  let platformSettingsDbService: { get: jest.Mock };

  const tokenPair = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 900 };

  beforeEach(async () => {
    authDbService = {
      signup: jest.fn(),
      putVerifyEmailToken: jest.fn(),
      verifyEmail: jest.fn(),
      findUserForLogin: jest.fn(),
      findUserById: jest.fn(),
      findTenantStatus: jest.fn(),
      findTenantErasureState: jest.fn().mockResolvedValue(null),
      hasConnectedBusiness: jest.fn().mockResolvedValue(false),
      updatePasswordAndRevokeSessions: jest.fn(),
      updateLocale: jest.fn(),
      putSetPasswordOtp: jest.fn(),
      consumeSetPasswordOtp: jest.fn().mockResolvedValue(true),
      insertRefreshToken: jest.fn(),
      findSsoIdentityBySub: jest.fn(),
      // Defaults to "no tenant user holds this address" so tests that only care about the sub
      // lookup need not stub the fallback.
      linkSsoIdentityByEmail: jest.fn().mockResolvedValue({ kind: 'unknown' }),
      completeSsoSignup: jest.fn(),
      findMemberInviteEmailByTokenHash: jest.fn(),
      acceptMemberInviteWithPassword: jest.fn(),
      acceptMemberInviteWithGoogleIdentity: jest.fn(),
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
      revokeByAccessToken: jest.fn(),
    } as unknown as jest.Mocked<TokenService>;

    otpAttemptService = {
      consumeAttempt: jest.fn().mockResolvedValue(true),
      reset: jest.fn(),
      claimResend: jest.fn().mockResolvedValue(true),
      releaseResend: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OtpAttemptService>;

    loginAttemptService = {
      isLockedOut: jest.fn().mockResolvedValue(false),
      recordFailure: jest.fn(),
      reset: jest.fn(),
    } as unknown as jest.Mocked<LoginAttemptService>;

    queueManager = {
      addRegisterationOtpEmailJob: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AddingJobsToQueueManager>;

    sessionRevocationService = { revokeUser: jest.fn().mockResolvedValue(undefined) };
    signupBindingService = {
      issue: jest.fn().mockReturnValue('binding-token'),
      matches: jest.fn().mockReturnValue(true),
    };

    platformAdminAuthService = {
      findLinkedAdmin: jest.fn().mockResolvedValue({ linked: false }),
      completeAdminInviteGoogle: jest.fn(),
      isAdminMicrosoftConfigured: jest.fn().mockReturnValue(true),
      adminMicrosoftTenantId: jest.fn().mockReturnValue(ADMIN_TID),
      signInWithMicrosoft: jest.fn(),
      adminInviteFailureUrl: jest
        .fn()
        .mockImplementation(
          (token: string, failure: string) =>
            `https://app.innopeak.test/invite/${token}?error=${failure}`
        ),
    } as unknown as jest.Mocked<PlatformAdminAuthService>;

    const configService = {
      get: jest.fn((key: string) => (key === 'FRONTEND_URL' ? 'https://app.innopeak.test' : 10)),
    } as unknown as ConfigService;

    microsoftIdentityProvider = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1'),
      fetchIdentity: jest.fn(),
    };

    googleIdentityProvider = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
      fetchIdentity: jest.fn(),
    };

    oauthStateService = {
      mint: jest.fn().mockResolvedValue({
        state: 'signed-state',
        sid: 'raw-sid',
        codeChallenge: 'google-challenge',
      }),
      consume: jest.fn(),
    } as unknown as jest.Mocked<OAuthStateService>;

    pendingSsoSignupService = {
      mint: jest.fn().mockResolvedValue('pending-nonce'),
      consume: jest.fn(),
    } as unknown as jest.Mocked<PendingSsoSignupService>;

    mediaService = {
      getUserAvatarUrl: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<MediaService>;

    platformSettingsDbService = {
      get: jest.fn().mockResolvedValue({ microsoftLoginEnabled: true }),
    };

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
        { provide: MicrosoftIdentityProvider, useValue: microsoftIdentityProvider },
        { provide: OAuthStateService, useValue: oauthStateService },
        { provide: PendingSsoSignupService, useValue: pendingSsoSignupService },
        { provide: PlatformAdminAuthService, useValue: platformAdminAuthService },
        { provide: MediaService, useValue: mediaService },
        { provide: PlatformSettingsDbService, useValue: platformSettingsDbService },
        { provide: SessionRevocationService, useValue: sessionRevocationService },
        { provide: SignupBindingService, useValue: signupBindingService },
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

    // Regression: the platform's password switch only hid the sign-up form, so a direct call still created an account.
    it.each([[{ passwordLoginEnabled: false }]])(
      'refuses a new email/password sign-up while the platform has it switched off (%j)',
      async settings => {
        platformSettingsDbService.get.mockResolvedValue(settings);

        await expect(target.signup(dto)).rejects.toBeInstanceOf(PasswordSignupDisabledException);

        expect(authDbService.signup).not.toHaveBeenCalled();
        expect(queueManager.addRegisterationOtpEmailJob).not.toHaveBeenCalled();
      }
    );

    it.each([[{ passwordLoginEnabled: true }], [null]])(
      'still signs up when the switch is on or the settings row is missing (%j)',
      async settings => {
        platformSettingsDbService.get.mockResolvedValue(settings);
        authDbService.signup.mockResolvedValue(null);

        await expect(target.signup(dto)).rejects.toThrow(ConflictException);
        expect(authDbService.signup).toHaveBeenCalled();
      }
    );

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
      expect(result.body.tenantId).toBe('tenant-1');
      expect(result.body.status).toBe(UserStatus.PENDING_VERIFICATION);
    });

    // Anyone can start a sign-up for an address they do not own; only this browser may finish it (see SignupBindingService).
    it('binds finishing the sign-up to this browser, from the password it just proved', async () => {
      authDbService.signup.mockResolvedValue({
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: UserStatus.PENDING_VERIFICATION,
        ownerName: 'Jane Doe',
      });

      const result = await target.signup(dto);

      expect(signupBindingService.issue).toHaveBeenCalledWith({
        id: 'user-1',
        passwordHash: 'hashed-password',
      });
      expect(result.signupBinding).toBe('binding-token');
      expect(result.body).not.toHaveProperty('signupBinding');
    });

    /**
     * Regression: tenant signup must not 409 when the email also belongs to a platform admin (dual
     * identity).
     */
    it('allows a tenant signup for an email that also belongs to a platform admin', async () => {
      authDbService.signup.mockResolvedValue({
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: UserStatus.PENDING_VERIFICATION,
        ownerName: 'Jane Doe',
      });

      await expect(target.signup(dto)).resolves.toMatchObject({
        body: { tenantId: 'tenant-1' },
      });
      expect(authDbService.signup).toHaveBeenCalled();
    });
  });

  // The platform's password switch is not only a sign-up switch: with no way to deliver email there is no sign-in by password either.
  // Each entry point must refuse before it reads an account, spends an attempt budget or consumes an invitation.
  describe('with the platform’s email/password switch off', () => {
    beforeEach(() => {
      platformSettingsDbService.get.mockResolvedValue({ passwordLoginEnabled: false });
    });

    it('refuses to sign in, before the attempt budget or any account lookup', async () => {
      await expect(
        target.login({ email: 'jane@thecoffeehouse.com', password: 'StrongP@ss1' })
      ).rejects.toBeInstanceOf(PasswordLoginDisabledException);

      expect(loginAttemptService.isLockedOut).not.toHaveBeenCalled();
      expect(loginAttemptService.recordFailure).not.toHaveBeenCalled();
      expect(authDbService.findUserForLogin).not.toHaveBeenCalled();
    });

    it('refuses the code that completes a password sign-up', async () => {
      await expect(
        target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '123456' }, 'binding-token')
      ).rejects.toBeInstanceOf(PasswordLoginDisabledException);

      expect(otpAttemptService.consumeAttempt).not.toHaveBeenCalled();
      expect(authDbService.verifyEmail).not.toHaveBeenCalled();
    });

    it('refuses to resend that code', async () => {
      await expect(target.resendOtp({ email: 'jane@thecoffeehouse.com' })).rejects.toBeInstanceOf(
        PasswordLoginDisabledException
      );

      expect(authDbService.findUserForLogin).not.toHaveBeenCalled();
    });

    it('refuses to accept an invitation with a password, leaving the invitation unspent', async () => {
      await expect(
        target.acceptMemberInvite({
          token: 'raw-token-1',
          name: 'Sam Rivera',
          password: 'NewStr0ng@Pass',
        })
      ).rejects.toBeInstanceOf(PasswordLoginDisabledException);

      expect(authDbService.acceptMemberInviteWithPassword).not.toHaveBeenCalled();
    });

    it('signs in again once the switch is back on', async () => {
      platformSettingsDbService.get.mockResolvedValue({ passwordLoginEnabled: true });
      authDbService.findUserForLogin.mockResolvedValue(null);

      await expect(target.login({ email: 'nobody@example.com', password: 'x' })).rejects.toThrow(
        UnauthorizedException
      );
      expect(authDbService.findUserForLogin).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('rejects with 429 once the per-account attempt budget is spent, without comparing the code', async () => {
      otpAttemptService.consumeAttempt.mockResolvedValue(false);

      await expect(
        target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '000000' }, 'binding-token')
      ).rejects.toMatchObject({ status: 429 });
      // never reaches the DB — a locked-out account is not probeable at all
      expect(authDbService.verifyEmail).not.toHaveBeenCalled();
    });

    it('counts the attempt against the normalized email', async () => {
      authDbService.verifyEmail.mockResolvedValue(null);

      await expect(
        target.verifyEmail({ email: '  JANE@thecoffeehouse.com ', otp: '000000' }, 'binding-token')
      ).rejects.toThrow();
      expect(otpAttemptService.consumeAttempt).toHaveBeenCalledWith({
        scope: OtpScope.VERIFY_EMAIL,
        identity: 'jane@thecoffeehouse.com',
      });
    });

    // The code proves the mailbox, not who chose the password: a stranger can start a sign-up for someone else's address and the
    // mailbox's owner then receives the code. Entering it must not activate an account whose password the stranger chose.
    describe('the browser binding of a pending sign-up', () => {
      const pendingUser = {
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        name: 'Jane Doe',
        role: UserRole.OWNER,
        passwordHash: 'stranger-chosen-hash',
        status: UserStatus.PENDING_VERIFICATION,
        locale: null,
      };

      it('refuses the code, like a wrong one, from a browser that does not hold the binding', async () => {
        authDbService.findUserForLogin.mockResolvedValue(pendingUser);
        signupBindingService.matches.mockReturnValue(false);

        await expect(
          target.verifyEmail({ email: pendingUser.email, otp: '482913' }, undefined)
        ).rejects.toThrow(MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP);

        expect(signupBindingService.matches).toHaveBeenCalledWith(pendingUser, undefined);
        // Never even tries the code, so the mailbox owner's code cannot be used from here.
        expect(authDbService.verifyEmail).not.toHaveBeenCalled();
        expect(otpAttemptService.reset).not.toHaveBeenCalled();
      });

      // The binding is checked first, so a stranger hammering the endpoint cannot use up the pending owner's attempts and lock them out.
      // Nothing is learned by it: the code is never compared without the binding, and the answer is the wrong-code one either way.
      it("does not spend the address's attempts, so a stranger cannot lock its owner out", async () => {
        authDbService.findUserForLogin.mockResolvedValue(pendingUser);
        signupBindingService.matches.mockReturnValue(false);

        await expect(
          target.verifyEmail({ email: pendingUser.email, otp: '482913' }, 'forged')
        ).rejects.toThrow();

        expect(otpAttemptService.consumeAttempt).not.toHaveBeenCalled();
        expect(authDbService.verifyEmail).not.toHaveBeenCalled();
      });

      it('finishes the verification for the browser that holds it', async () => {
        authDbService.findUserForLogin.mockResolvedValue(pendingUser);
        signupBindingService.matches.mockReturnValue(true);
        authDbService.verifyEmail.mockResolvedValue({ ...pendingUser, status: UserStatus.ACTIVE });

        const result = await target.verifyEmail(
          { email: pendingUser.email, otp: '482913' },
          'binding-token'
        );

        expect(signupBindingService.matches).toHaveBeenCalledWith(pendingUser, 'binding-token');
        expect(result.body.accessToken).toBe('access');
      });

      // An address with no pending sign-up falls through to the ordinary wrong-code answer: the binding never reveals whether one exists.
      it('does not consult the binding for an address with no pending sign-up', async () => {
        authDbService.findUserForLogin.mockResolvedValue(null);
        authDbService.verifyEmail.mockResolvedValue(null);

        await expect(
          target.verifyEmail({ email: 'nobody@thecoffeehouse.com', otp: '482913' }, undefined)
        ).rejects.toThrow(MESSAGES.AUTH.INVALID_OR_EXPIRED_OTP);

        expect(signupBindingService.matches).not.toHaveBeenCalled();
      });
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

      await target.verifyEmail(
        { email: 'jane@thecoffeehouse.com', otp: '482913' },
        'binding-token'
      );

      expect(otpAttemptService.reset).toHaveBeenCalledWith({
        scope: OtpScope.VERIFY_EMAIL,
        identity: 'jane@thecoffeehouse.com',
      });
    });

    it('leaves the budget spent after a wrong code', async () => {
      authDbService.verifyEmail.mockResolvedValue(null);

      await expect(
        target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '000000' }, 'binding-token')
      ).rejects.toThrow();
      expect(otpAttemptService.reset).not.toHaveBeenCalled();
    });

    it('throws 400 when the DB service can not verify the code', async () => {
      authDbService.verifyEmail.mockResolvedValue(null);

      await expect(
        target.verifyEmail({ email: 'jane@thecoffeehouse.com', otp: '000000' }, 'binding-token')
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

      const result = await target.verifyEmail(
        { email: 'jane@thecoffeehouse.com', otp: '482913' },
        'binding-token'
      );

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
      // Deliberately still compares (against the decoy): an SSO-only account must not be
      // distinguishable by response time from a wrong-password account.
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

    it('names an erasure this very user requested, with the deadline, after the password is proven', async () => {
      // A fixed clock: the deadline is 2026-10-16, so against the real date this test started failing the day after it.
      const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-08T00:00:00.000Z'));
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
      });
      authDbService.findTenantErasureState.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
        erasureRequestedAt: '2026-10-06T00:00:00.000Z',
        erasureRequestedByUserId: activeUser.id,
      });

      await expect(
        target.login({ email: activeUser.email, password: 'StrongP@ss1' })
      ).rejects.toMatchObject({
        response: {
          code: 'ACCOUNT_SCHEDULED_FOR_DELETION',
          // the spec's ConfigService answers 10 for every numeric key: 2026-10-06 + 10 days
          message: expect.stringContaining('2026-10-16'),
        },
      });
      now.mockRestore();
    });

    it('offers no restore once the deadline has passed — the purge may already have released resources', async () => {
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
      });
      authDbService.findTenantErasureState.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
        // the spec's ConfigService answers 10 days of grace
        erasureRequestedAt: new Date(Date.now() - 11 * 86_400_000).toISOString(),
        erasureRequestedByUserId: activeUser.id,
      });

      await expect(
        target.login({ email: activeUser.email, password: 'StrongP@ss1' })
      ).rejects.toMatchObject({ response: { code: 'TENANT_SUSPENDED' } });
    });

    it('keeps the generic suspension for an erasure someone else requested', async () => {
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
      });
      authDbService.findTenantErasureState.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
        erasureRequestedAt: '2026-10-06T00:00:00.000Z',
        erasureRequestedByUserId: null,
      });

      await expect(
        target.login({ email: activeUser.email, password: 'StrongP@ss1' })
      ).rejects.toMatchObject({ response: { code: 'TENANT_SUSPENDED' } });
    });

    /**
     * Defense in depth: an already-issued session is rejected once every user in the tenant is
     * anonymized.
     */
    it('throws 403 for an erased tenant', async () => {
      authDbService.findUserForLogin.mockResolvedValue(activeUser);
      hashingService.compare.mockResolvedValue(true);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ERASED,
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
        pendingVerification: true,
        body: { status: UserStatus.PENDING_VERIFICATION, email: activeUser.email },
        // The password was just proven, so this browser may finish the verification.
        signupBinding: 'binding-token',
      });
      expect(signupBindingService.issue).toHaveBeenCalledWith({
        id: activeUser.id,
        passwordHash: activeUser.passwordHash,
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

    // The cooldown exists to stop overwriting a pending code; a code that never left must not hold it, or the next click is "wait".
    it('gives the resend cooldown back when the email queue refuses the code, and still answers generically', async () => {
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
      queueManager.addRegisterationOtpEmailJob.mockRejectedValue(new Error('redis down'));

      const result = await target.resendOtp({ email: 'jane@thecoffeehouse.com' });

      expect(otpAttemptService.releaseResend).toHaveBeenCalledWith({
        scope: OtpScope.VERIFY_EMAIL,
        identity: 'jane@thecoffeehouse.com',
      });
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
      const result = await target.logout({ refreshToken: 'raw-refresh-token', accessTokens: [] });

      expect(tokenService.revokeBySessionToken).toHaveBeenCalledWith('raw-refresh-token');
      expect(result.message).toBeTruthy();
    });

    // A platform admin has no refresh token, so the access token is the only thing a logout can end for them.
    it('ends each distinct access token presented, once', async () => {
      await target.logout({
        refreshToken: undefined,
        accessTokens: ['admin-access', 'tenant-access', 'admin-access'],
      });

      expect(tokenService.revokeByAccessToken).toHaveBeenCalledTimes(2);
      expect(tokenService.revokeByAccessToken).toHaveBeenCalledWith('admin-access');
      expect(tokenService.revokeByAccessToken).toHaveBeenCalledWith('tenant-access');
    });

    // The whole point of driving logout off the refresh cookie: it must still succeed when the
    // access token has expired, and when the cookie is already gone.
    it('succeeds without revoking anything when no refresh cookie was sent', async () => {
      const result = await target.logout({ refreshToken: undefined, accessTokens: [] });

      expect(tokenService.revokeBySessionToken).not.toHaveBeenCalled();
      expect(tokenService.revokeByAccessToken).not.toHaveBeenCalled();
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
          { type: JwtTokenType.PLATFORM_ADMIN, id: 'admin-1', email: 'a@x.com', locale: null },
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

    it('counts a wrong current password against the sign-in budget', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(false);

      await expect(target.changePassword(tenantUser, dto)).rejects.toThrow(UnauthorizedException);

      expect(loginAttemptService.recordFailure).toHaveBeenCalledWith(
        'jane@thecoffeehouse.com',
        LoginAttemptScope.TENANT
      );
    });

    it('answers a locked-out account as a wrong password, without comparing', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      loginAttemptService.isLockedOut.mockResolvedValue(true);

      await expect(target.changePassword(tenantUser, dto)).rejects.toThrow(UnauthorizedException);

      expect(hashingService.compare).not.toHaveBeenCalled();
      expect(authDbService.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
    });

    it('clears the budget once the current password is proven', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(true);
      hashingService.hash.mockResolvedValue('new-hash');

      await target.changePassword(tenantUser, dto);

      expect(loginAttemptService.reset).toHaveBeenCalledWith(
        'jane@thecoffeehouse.com',
        LoginAttemptScope.TENANT
      );
    });

    it('rejects a new password identical to the current one, without signing anyone out', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(true);

      await expect(
        target.changePassword(tenantUser, {
          currentPassword: 'StrongP@ss1',
          newPassword: 'StrongP@ss1',
        })
      ).rejects.toMatchObject({ response: { code: 'NEW_PASSWORD_SAME_AS_CURRENT' } });
      expect(authDbService.updatePasswordAndRevokeSessions).not.toHaveBeenCalled();
    });

    it('checks the current password before reporting an unchanged one, so nothing is revealed', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(false);

      await expect(
        target.changePassword(tenantUser, {
          currentPassword: 'Wrong@Pass1',
          newPassword: 'Wrong@Pass1',
        })
      ).rejects.toThrow(UnauthorizedException);
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

    // The refresh tokens die in the database; a JWT cannot be taken back, so the access tokens already issued are ended with a mark.
    // The caller's fresh pair follows at once, in the same second, so the mark must spare tokens issued now.
    it('ends the access tokens already issued, sparing the fresh pair issued right after', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(true);
      hashingService.hash.mockResolvedValue('new-hash');

      await target.changePassword(tenantUser, dto);

      expect(sessionRevocationService.revokeUser).toHaveBeenCalledWith('user-1', {
        exceptCurrentSecond: true,
      });
      const [update] = authDbService.updatePasswordAndRevokeSessions.mock.invocationCallOrder;
      const [revoke] = sessionRevocationService.revokeUser.mock.invocationCallOrder;
      const [issue] = tokenService.issueTokenPair.mock.invocationCallOrder;
      // The mark first (a refresh rotating at that moment re-checks it), then the UPDATE, then the caller's fresh pair.
      expect(revoke).toBeLessThan(update as number);
      expect(update).toBeLessThan(issue as number);
      // And once more after the UPDATE, for a rotation that started in the next second.
      const [, revokeAgain] = sessionRevocationService.revokeUser.mock.invocationCallOrder;
      expect(revokeAgain).toBeGreaterThan(update as number);
      expect(revokeAgain).toBeLessThan(issue as number);
    });

    it('revokes nothing when the current password is wrong', async () => {
      authDbService.findUserById.mockResolvedValue(storedUser);
      hashingService.compare.mockResolvedValue(false);

      await expect(
        target.changePassword(tenantUser, {
          currentPassword: 'Wrong@Pass1',
          newPassword: 'N3w@Pass12',
        })
      ).rejects.toThrow(UnauthorizedException);

      expect(sessionRevocationService.revokeUser).not.toHaveBeenCalled();
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
     * Regression: a stolen access token alone could call `setPassword` on a Google-only account;
     * `otp` must be checked before the password is hashed or written.
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
      expect(otpAttemptService.reset).toHaveBeenCalledWith({
        scope: OtpScope.SET_PASSWORD,
        identity: 'user-1',
      });
      expect(sessionRevocationService.revokeUser).toHaveBeenCalledWith('user-1', {
        exceptCurrentSecond: true,
      });

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

    it('answers 503 and gives the cooldown back when the email queue refuses the code', async () => {
      authDbService.findUserById.mockResolvedValue(passwordlessUser);
      queueManager.addRegisterationOtpEmailJob.mockRejectedValue(new Error('redis down'));

      await expect(target.requestSetPasswordOtp(tenantUser)).rejects.toMatchObject({
        response: { code: 'EMAIL_QUEUE_UNAVAILABLE' },
      });

      expect(otpAttemptService.releaseResend).toHaveBeenCalledWith({
        scope: OtpScope.SET_PASSWORD,
        identity: 'user-1',
      });
    });

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
          { type: JwtTokenType.PLATFORM_ADMIN, id: 'admin-1', email: 'a@x.com', locale: null },
          { locale: 'de' }
        )
      ).rejects.toThrow(ForbiddenException);
      expect(authDbService.findUserById).not.toHaveBeenCalled();
    });

    /**
     * Regression: `updateLocale` must re-sign only the access token; `issueTokenPair` would turn a
     * leaked access token into a rotatable 7-day session.
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
        expect.objectContaining({ id: 'user-1', locale: 'de' }),
        // No `exp` on this token: falls back to the full TTL.
        900
      );
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
      expect(authDbService.insertRefreshToken).not.toHaveBeenCalled();
      expect(result.accessToken).toBe('new-access');
      expect(result.expiresIn).toBe(900);
      expect(result).not.toHaveProperty('refreshToken');
      expect(result.user.locale).toBe('de');
    });

    // Regression: a fresh TTL on every call let a stolen access token renew itself indefinitely, outliving a logout and a password
    // change. The new token must die when the presented one does.
    describe('the lifetime of the re-signed token', () => {
      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-10-15T10:00:00Z'));
        authDbService.findUserById.mockResolvedValue(storedUser);
        authDbService.findTenantStatus.mockResolvedValue({
          status: TenantStatus.ACTIVE,
          name: 'The Coffee House',
        });
      });
      afterEach(() => jest.useRealTimers());

      it("is the presented token's remaining lifetime", async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);
        tokenService.reissueAccessToken.mockReturnValueOnce({ accessToken: 'n', expiresIn: 120 });

        const result = await target.updateLocale(
          { ...tenantUser, sessionExpiresAt: nowSeconds + 120 },
          { locale: 'de' }
        );

        expect(tokenService.reissueAccessToken).toHaveBeenCalledWith(expect.anything(), 120);
        expect(result.expiresIn).toBe(120);
      });

      it('never exceeds the full access-token TTL, whatever the token claims', async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);

        await target.updateLocale(
          { ...tenantUser, sessionExpiresAt: nowSeconds + 10_000 },
          { locale: 'de' }
        );

        expect(tokenService.reissueAccessToken).toHaveBeenCalledWith(expect.anything(), 900);
      });

      it('is at least a second for a token about to expire, never a born-expired one', async () => {
        const nowSeconds = Math.floor(Date.now() / 1000);

        await target.updateLocale(
          { ...tenantUser, sessionExpiresAt: nowSeconds },
          { locale: 'de' }
        );

        expect(tokenService.reissueAccessToken).toHaveBeenCalledWith(expect.anything(), 1);
      });
    });

    /**
     * Regression: a disabled user renewing their access token forever through this route; it must
     * check `user.status`.
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
      record: {
        provider: SsoProvider.GOOGLE,
        nonce: 'n',
        intent: OAuthIntent.SIGNUP,
        sidHash: 'h',
      },
    };
    const loginState = {
      ok: true as const,
      record: { provider: SsoProvider.GOOGLE, nonce: 'n', intent: OAuthIntent.LOGIN, sidHash: 'h' },
    };

    describe('authorize', () => {
      it('mints state for the given intent — no business name travels here any more', async () => {
        await target.buildGoogleAuthorizeRedirect({ intent: OAuthIntent.SIGNUP });

        expect(oauthStateService.mint).toHaveBeenCalledWith({
          provider: SsoProvider.GOOGLE,
          intent: OAuthIntent.SIGNUP,
          pkce: true,
        });
      });

      // PKCE binds the code to this server's request; the verifier stays in the Redis record and only its challenge leaves.
      it('sends only the PKCE challenge to Google', async () => {
        await target.buildGoogleAuthorizeRedirect({ intent: OAuthIntent.LOGIN });

        expect(googleIdentityProvider.buildAuthorizationUrl).toHaveBeenCalledWith({
          state: 'signed-state',
          codeChallenge: 'google-challenge',
        });
      });

      // Regression: the Google switch only hid the button, so a direct link still signed people in.
      it.each([
        [OAuthIntent.LOGIN, SSO_REDIRECT.LOGIN],
        [OAuthIntent.SIGNUP, SSO_REDIRECT.SIGNUP],
      ])(
        'refuses a %s start with NOT_CONFIGURED while the platform has Google switched off',
        async (intent, base) => {
          platformSettingsDbService.get.mockResolvedValue({ googleLoginEnabled: false });

          await expect(target.buildGoogleAuthorizeRedirect({ intent })).resolves.toEqual({
            ok: false,
            redirectUrl: `${base}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=google`,
          });
          expect(oauthStateService.mint).not.toHaveBeenCalled();
        }
      );

      it('treats a missing platform settings row as switched on, the column default', async () => {
        platformSettingsDbService.get.mockResolvedValue(null);

        await expect(
          target.buildGoogleAuthorizeRedirect({ intent: OAuthIntent.LOGIN })
        ).resolves.toMatchObject({ ok: true });
      });

      it('answers with a redirect rather than throwing when the client is unconfigured', async () => {
        googleIdentityProvider.isConfigured.mockReturnValue(false);

        const redirect = await target.buildGoogleAuthorizeRedirect({ intent: OAuthIntent.LOGIN });

        expect(redirect).toEqual({
          ok: false,
          redirectUrl: `${SSO_REDIRECT.LOGIN}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=google`,
        });
      });
    });

    describe('callback', () => {
      it('signs in an existing account and normalizes the email first', async () => {
        oauthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({
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
        expect(authDbService.findSsoIdentityBySub).toHaveBeenCalledWith(
          SsoProvider.GOOGLE,
          identity.providerUserId
        );
      });

      describe('with the platform Google switch off', () => {
        beforeEach(() => {
          platformSettingsDbService.get.mockResolvedValue({ googleLoginEnabled: false });
        });

        const callbackInput = { code: 'c', state: 's', error: undefined, sid: 'sid' };
        const stateFor = (intent: OAuthIntent, inviteToken?: string) => ({
          ok: true as const,
          record: {
            provider: SsoProvider.GOOGLE,
            nonce: 'n',
            intent,
            sidHash: 'h',
            ...(inviteToken !== undefined && { inviteToken }),
          },
        });

        // The switch may be turned off while someone is at Google: the callback re-checks, and never exchanges the code.
        it.each([
          [
            OAuthIntent.LOGIN,
            `${SSO_REDIRECT.LOGIN}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=google`,
          ],
          [
            OAuthIntent.SIGNUP,
            `${SSO_REDIRECT.SIGNUP}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=google`,
          ],
        ])('refuses a %s callback without exchanging the code', async (intent, redirectUrl) => {
          oauthStateService.consume.mockResolvedValue(stateFor(intent));

          const outcome = await target.handleGoogleCallback(callbackInput);

          expect(outcome).toEqual({
            ok: false,
            failure: SsoAuthFailure.NOT_CONFIGURED,
            redirectUrl,
          });
          expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
        });

        it('refuses an invite callback and sends the invitee back to their accept page', async () => {
          oauthStateService.consume.mockResolvedValue(stateFor(OAuthIntent.INVITE, 'raw-token-1'));

          const outcome = await target.handleGoogleCallback(callbackInput);

          expect(outcome).toMatchObject({
            ok: false,
            failure: SsoAuthFailure.NOT_CONFIGURED,
            redirectUrl: expect.stringContaining('/accept-invite/raw-token-1?error=NOT_CONFIGURED'),
          });
          expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
        });

        // An admin who joined through Google has no password, so this must keep working (and the admin settings refuse to switch it
        // off while one exists).
        it.each([OAuthIntent.ADMIN_LOGIN, OAuthIntent.ADMIN_INVITE])(
          'never blocks a platform admin: %s still exchanges the code',
          async intent => {
            oauthStateService.consume.mockResolvedValue(stateFor(intent, 'admin-token'));
            googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
            platformAdminAuthService.findLinkedAdmin.mockResolvedValue({ linked: false });
            platformAdminAuthService.completeAdminInviteGoogle.mockResolvedValue({
              ok: false,
              failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
              redirectUrl: '/accept-invite',
            });

            await target.handleGoogleCallback(callbackInput);

            // A state minted before PKCE shipped carries no verifier, and no challenge went out for it.
            expect(googleIdentityProvider.fetchIdentity).toHaveBeenCalledWith('c', {});
          }
        );
      });

      it('redeems the code with the verifier stored for this round trip', async () => {
        oauthStateService.consume.mockResolvedValue({
          ok: true as const,
          record: {
            provider: SsoProvider.GOOGLE,
            nonce: 'n',
            intent: OAuthIntent.LOGIN,
            sidHash: 'h',
            codeVerifier: 'stored-verifier',
          },
        });
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });

        await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(googleIdentityProvider.fetchIdentity).toHaveBeenCalledWith('c', {
          codeVerifier: 'stored-verifier',
        });
      });

      it('consumes the state before exchanging the code, so a replay costs no round trip', async () => {
        oauthStateService.consume.mockResolvedValue({ ok: false });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 'replayed',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toEqual({
          ok: false,
          failure: SsoAuthFailure.INVALID_STATE,
          redirectUrl: `${SSO_REDIRECT.LOGIN}?error=${SsoAuthFailure.INVALID_STATE}&provider=google`,
        });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('refuses an email Google has not verified', async () => {
        oauthStateService.consume.mockResolvedValue(signupState);
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

        expect(outcome).toMatchObject({ failure: SsoAuthFailure.EMAIL_NOT_VERIFIED });
        expect(authDbService.findSsoIdentityBySub).not.toHaveBeenCalled();
      });

      it('returns NO_ACCOUNT rather than starting a pending signup on a login', async () => {
        oauthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toMatchObject({ failure: SsoAuthFailure.NO_ACCOUNT });
        expect(pendingSsoSignupService.mint).not.toHaveBeenCalled();
      });

      it('mints a pending signup rather than a tenant for a genuinely new signup', async () => {
        oauthStateService.consume.mockResolvedValue(signupState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });
        pendingSsoSignupService.mint.mockResolvedValue('pending-nonce');

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
        expect(pendingSsoSignupService.mint).toHaveBeenCalledWith({
          provider: SsoProvider.GOOGLE,
          providerUserId: 'google-sub-1',
          email: 'owner@example.com',
          name: 'Jane Doe',
        });
        expect(authDbService.findTenantStatus).not.toHaveBeenCalled();
      });

      it('reports an error Google raises on its side as PROVIDER_ERROR, not as a cancellation', async () => {
        oauthStateService.consume.mockResolvedValue(signupState);

        const outcome = await target.handleGoogleCallback({
          code: undefined,
          state: 's',
          error: 'server_error',
          sid: 'sid',
        });

        expect(outcome).toMatchObject({ ok: false, failure: SsoAuthFailure.PROVIDER_ERROR });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('reports a declined consent without calling Google at all', async () => {
        oauthStateService.consume.mockResolvedValue(signupState);

        const outcome = await target.handleGoogleCallback({
          code: undefined,
          state: 's',
          error: 'access_denied',
          sid: 'sid',
        });

        // Keeps the signup-page redirect for an abandoned signup, and spends the state either way
        // (single-use).
        expect(outcome).toEqual({
          ok: false,
          failure: SsoAuthFailure.ACCESS_DENIED,
          redirectUrl: `${SSO_REDIRECT.SIGNUP}?error=${SsoAuthFailure.ACCESS_DENIED}&provider=google`,
        });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('still reports a declined consent when the state is unusable, falling back to the login page', async () => {
        oauthStateService.consume.mockResolvedValue({ ok: false });

        const outcome = await target.handleGoogleCallback({
          code: undefined,
          state: undefined,
          error: 'access_denied',
          sid: undefined,
        });

        expect(outcome).toEqual({
          ok: false,
          failure: SsoAuthFailure.ACCESS_DENIED,
          redirectUrl: `${SSO_REDIRECT.LOGIN}?error=${SsoAuthFailure.ACCESS_DENIED}&provider=google`,
        });
        expect(googleIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it('maps a provider failure to a redirect rather than throwing mid-navigation', async () => {
        oauthStateService.consume.mockResolvedValue(signupState);
        googleIdentityProvider.fetchIdentity.mockRejectedValue(new Error('google is down'));

        const outcome = await target.handleGoogleCallback({
          code: 'c',
          state: 's',
          error: undefined,
          sid: 'sid',
        });

        expect(outcome).toMatchObject({
          failure: SsoAuthFailure.PROVIDER_ERROR,
          redirectUrl: `${SSO_REDIRECT.SIGNUP}?error=${SsoAuthFailure.PROVIDER_ERROR}&provider=google`,
        });
      });

      it('refuses a disabled account, the same standing check password login applies', async () => {
        oauthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({
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
          failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE,
          redirectUrl: `${SSO_REDIRECT.LOGIN}?error=${SsoAuthFailure.ACCOUNT_UNAVAILABLE}&provider=google`,
        });
        // Refused before any token is minted — not merely revoked on the next refresh.
        expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
      });

      it('refuses a suspended tenant even though the identity is valid', async () => {
        oauthStateService.consume.mockResolvedValue(loginState);
        googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({
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

        expect(outcome).toMatchObject({ failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE });
      });
    });

    describe('completeSsoSignup', () => {
      it('creates the tenant from the pending identity and issues tokens', async () => {
        pendingSsoSignupService.consume.mockResolvedValue({
          ok: true,
          identity: {
            provider: SsoProvider.GOOGLE,
            providerUserId: 'google-sub-1',
            email: 'owner@example.com',
            name: 'Jane Doe',
          },
        });
        authDbService.completeSsoSignup.mockResolvedValue(resolvedUser);

        const result = await target.completeSsoSignup('pending-nonce', 'The Coastal Table');

        expect(authDbService.completeSsoSignup).toHaveBeenCalledWith({
          provider: SsoProvider.GOOGLE,
          providerUserId: 'google-sub-1',
          email: 'owner@example.com',
          name: 'Jane Doe',
          businessName: 'The Coastal Table',
        });
        expect(result.body.accessToken).toBe('access');
      });

      // Regression: the callback checked the switch, but the business-name step that actually creates the tenant did not.
      it.each([
        [SsoProvider.GOOGLE, { googleLoginEnabled: false }],
        [SsoProvider.MICROSOFT, { microsoftLoginEnabled: false }],
      ])(
        'refuses to create the tenant when %s was switched off during the business-name step',
        async (provider, settings) => {
          platformSettingsDbService.get.mockResolvedValue(settings);
          pendingSsoSignupService.consume.mockResolvedValue({
            ok: true,
            identity: {
              provider,
              providerUserId: 'sub-1',
              email: 'owner@example.com',
              name: 'Jane',
            },
          });

          await expect(
            target.completeSsoSignup('pending-nonce', 'The Coastal Table')
          ).rejects.toThrow(MESSAGES.AUTH.SSO_SIGNUP_DISABLED);
          expect(authDbService.completeSsoSignup).not.toHaveBeenCalled();
        }
      );

      it('only looks at the provider the pending sign-up came through', async () => {
        platformSettingsDbService.get.mockResolvedValue({ microsoftLoginEnabled: false });
        pendingSsoSignupService.consume.mockResolvedValue({
          ok: true,
          identity: {
            provider: SsoProvider.GOOGLE,
            providerUserId: 'google-sub-1',
            email: 'owner@example.com',
            name: 'Jane',
          },
        });
        authDbService.completeSsoSignup.mockResolvedValue(resolvedUser);

        await expect(
          target.completeSsoSignup('pending-nonce', 'The Coastal Table')
        ).resolves.toBeDefined();
      });

      it('rejects a missing, expired, or already-consumed pending signup', async () => {
        pendingSsoSignupService.consume.mockResolvedValue({ ok: false });

        await expect(target.completeSsoSignup(undefined, 'The Coastal Table')).rejects.toThrow(
          MESSAGES.AUTH.SSO_PENDING_SIGNUP_EXPIRED
        );
        expect(authDbService.completeSsoSignup).not.toHaveBeenCalled();
      });

      it('reports a conflict when the email was claimed in the meantime', async () => {
        pendingSsoSignupService.consume.mockResolvedValue({
          ok: true,
          identity: {
            provider: SsoProvider.GOOGLE,
            providerUserId: 'google-sub-1',
            email: 'owner@example.com',
            name: null,
          },
        });
        authDbService.completeSsoSignup.mockResolvedValue(null);

        await expect(
          target.completeSsoSignup('pending-nonce', 'The Coastal Table')
        ).rejects.toThrow(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
      });
    });
  });

  describe('Microsoft sign-in', () => {
    const identity = {
      providerUserId: 'ms-sub-1',
      email: 'Owner@Acme.test',
      emailVerified: true,
      name: 'Jane Doe',
    };
    const resolvedUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'owner@acme.test',
      name: 'Jane Doe',
      role: UserRole.OWNER,
      passwordHash: null,
      status: UserStatus.ACTIVE,
      locale: null,
    };
    const record = (intent: OAuthIntent) => ({
      ok: true as const,
      record: {
        provider: SsoProvider.MICROSOFT,
        nonce: 'oidc-nonce',
        codeVerifier: 'verifier',
        intent,
        sidHash: 'h',
      },
    });
    const callback = (overrides: Record<string, string | undefined> = {}) =>
      target.handleMicrosoftCallback({
        code: 'c',
        state: 's',
        error: undefined,
        sid: 'sid',
        ...overrides,
      });
    const activeTenant = { status: TenantStatus.ACTIVE, name: 'Test Tenant' };

    describe('authorize', () => {
      it('mints a provider-bound state with PKCE and hands the nonce and challenge to Microsoft', async () => {
        oauthStateService.mint.mockResolvedValue({
          state: 'signed-state',
          sid: 'raw-sid',
          nonce: 'oidc-nonce',
          codeChallenge: 'challenge',
        });

        const redirect = await target.buildMicrosoftAuthorizeRedirect({
          intent: OAuthIntent.SIGNUP,
        });

        expect(oauthStateService.mint).toHaveBeenCalledWith({
          provider: SsoProvider.MICROSOFT,
          intent: OAuthIntent.SIGNUP,
          pkce: true,
        });
        expect(microsoftIdentityProvider.buildAuthorizationUrl).toHaveBeenCalledWith({
          state: 'signed-state',
          nonce: 'oidc-nonce',
          codeChallenge: 'challenge',
        });
        expect(redirect).toMatchObject({ ok: true, sid: 'raw-sid' });
      });

      // Regression: the platform switch only hid the button, so a direct link still signed people in.
      it('refuses with NOT_CONFIGURED while the platform has Microsoft SSO switched off', async () => {
        platformSettingsDbService.get.mockResolvedValue({ microsoftLoginEnabled: false });

        await expect(
          target.buildMicrosoftAuthorizeRedirect({ intent: OAuthIntent.SIGNUP })
        ).resolves.toEqual({
          ok: false,
          redirectUrl: `${SSO_REDIRECT.SIGNUP}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=microsoft`,
        });
        expect(oauthStateService.mint).not.toHaveBeenCalled();
      });

      it('treats a missing platform settings row as switched on, the column default', async () => {
        platformSettingsDbService.get.mockResolvedValue(null);
        oauthStateService.mint.mockResolvedValue({
          state: 'signed-state',
          sid: 'raw-sid',
          nonce: 'oidc-nonce',
          codeChallenge: 'challenge',
        });

        await expect(
          target.buildMicrosoftAuthorizeRedirect({ intent: OAuthIntent.LOGIN })
        ).resolves.toMatchObject({ ok: true });
      });

      it('redirects with NOT_CONFIGURED to the screen the click came from', async () => {
        microsoftIdentityProvider.isConfigured.mockReturnValue(false);

        await expect(
          target.buildMicrosoftAuthorizeRedirect({ intent: OAuthIntent.SIGNUP })
        ).resolves.toEqual({
          ok: false,
          redirectUrl: `${SSO_REDIRECT.SIGNUP}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=microsoft`,
        });
        await expect(
          target.buildMicrosoftAuthorizeRedirect({ intent: OAuthIntent.LOGIN })
        ).resolves.toMatchObject({
          redirectUrl: `${SSO_REDIRECT.LOGIN}?error=NOT_CONFIGURED&provider=microsoft`,
        });
        expect(oauthStateService.mint).not.toHaveBeenCalled();
      });
    });

    describe('callback', () => {
      it('consumes the state for the Microsoft provider and passes the nonce and verifier to the exchange', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));
        microsoftIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({
          kind: 'known',
          user: resolvedUser,
          firstActivation: false,
        });
        authDbService.findTenantStatus.mockResolvedValue(activeTenant);

        const outcome = await callback();

        expect(outcome).toMatchObject({ ok: true, kind: 'signed_in' });
        expect(oauthStateService.consume).toHaveBeenCalledWith(SsoProvider.MICROSOFT, 's', 'sid');
        expect(microsoftIdentityProvider.fetchIdentity).toHaveBeenCalledWith('c', {
          codeVerifier: 'verifier',
          nonce: 'oidc-nonce',
        });
        expect(authDbService.findSsoIdentityBySub).toHaveBeenCalledWith(
          SsoProvider.MICROSOFT,
          'ms-sub-1'
        );
      });

      it('rejects a replayed or foreign state before any code exchange', async () => {
        oauthStateService.consume.mockResolvedValue({ ok: false });

        await expect(callback()).resolves.toEqual({
          ok: false,
          failure: SsoAuthFailure.INVALID_STATE,
          redirectUrl: `${SSO_REDIRECT.LOGIN}?error=${SsoAuthFailure.INVALID_STATE}&provider=microsoft`,
        });
        expect(microsoftIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it.each([OAuthIntent.ADMIN_INVITE, OAuthIntent.INVITE])(
        'refuses a state whose intent (%s) is not one the Microsoft routes mint',
        async intent => {
          oauthStateService.consume.mockResolvedValue(record(intent));

          await expect(callback()).resolves.toMatchObject({
            failure: SsoAuthFailure.INVALID_STATE,
          });
          expect(microsoftIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
        }
      );

      describe('platform-admin sign-in (ADMIN_LOGIN)', () => {
        const adminTokens = { admin: true as const, body: { accessToken: 'admin-access' } };

        beforeEach(() => {
          oauthStateService.consume.mockResolvedValue(record(OAuthIntent.ADMIN_LOGIN));
          microsoftIdentityProvider.fetchIdentity.mockResolvedValue({
            ...identity,
            tenantId: ADMIN_TID,
          });
        });

        it('exchanges the code against the pinned directory and signs a resolved admin in, never touching the tenant tables', async () => {
          platformAdminAuthService.signInWithMicrosoft.mockResolvedValue({
            ok: true,
            tokens: adminTokens as never,
          });

          await expect(callback()).resolves.toEqual({
            ok: true,
            kind: 'admin_signed_in',
            tokens: adminTokens,
          });
          expect(microsoftIdentityProvider.fetchIdentity).toHaveBeenCalledWith('c', {
            codeVerifier: 'verifier',
            nonce: 'oidc-nonce',
            tenantId: ADMIN_TID,
          });
          expect(authDbService.findSsoIdentityBySub).not.toHaveBeenCalled();
        });

        it.each([
          SsoAuthFailure.NO_ACCOUNT,
          SsoAuthFailure.ACCOUNT_UNAVAILABLE,
          SsoAuthFailure.EMAIL_NOT_VERIFIED,
        ])('sends a %s failure to the admin sign-in page, tagged as Microsoft', async failure => {
          platformAdminAuthService.signInWithMicrosoft.mockResolvedValue({ ok: false, failure });

          await expect(callback()).resolves.toEqual({
            ok: false,
            failure,
            redirectUrl: `${SSO_REDIRECT.ADMIN_LOGIN}?error=${failure}&provider=microsoft`,
          });
        });

        // The platform's Microsoft switch governs tenant sign-in only, like Google's.
        it('ignores the tenant Microsoft switch', async () => {
          platformSettingsDbService.get.mockResolvedValue({ microsoftLoginEnabled: false });
          platformAdminAuthService.signInWithMicrosoft.mockResolvedValue({
            ok: true,
            tokens: adminTokens as never,
          });

          await expect(callback()).resolves.toMatchObject({ ok: true, kind: 'admin_signed_in' });
        });

        it('refuses with NOT_CONFIGURED, without exchanging the code, once the admin setup was removed mid-flight', async () => {
          platformAdminAuthService.isAdminMicrosoftConfigured.mockReturnValue(false);

          await expect(callback()).resolves.toEqual({
            ok: false,
            failure: SsoAuthFailure.NOT_CONFIGURED,
            redirectUrl: `${SSO_REDIRECT.ADMIN_LOGIN}?error=NOT_CONFIGURED&provider=microsoft`,
          });
          expect(microsoftIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
        });

        it('reports a failed exchange as PROVIDER_ERROR on the admin page', async () => {
          microsoftIdentityProvider.fetchIdentity.mockRejectedValue(new Error('bad token'));

          await expect(callback()).resolves.toMatchObject({
            failure: SsoAuthFailure.PROVIDER_ERROR,
            redirectUrl: `${SSO_REDIRECT.ADMIN_LOGIN}?error=PROVIDER_ERROR&provider=microsoft`,
          });
          expect(platformAdminAuthService.signInWithMicrosoft).not.toHaveBeenCalled();
        });
      });

      it('refuses a callback once Microsoft SSO was switched off mid-flight, without exchanging the code', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.SIGNUP));
        platformSettingsDbService.get.mockResolvedValue({ microsoftLoginEnabled: false });

        await expect(callback()).resolves.toEqual({
          ok: false,
          failure: SsoAuthFailure.NOT_CONFIGURED,
          redirectUrl: `${SSO_REDIRECT.SIGNUP}?error=${SsoAuthFailure.NOT_CONFIGURED}&provider=microsoft`,
        });
        expect(microsoftIdentityProvider.fetchIdentity).not.toHaveBeenCalled();
      });

      it.each(['server_error', 'temporarily_unavailable', 'consent_required'])(
        'reports a Microsoft-side %s as PROVIDER_ERROR, not as a cancellation',
        async error => {
          oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));

          await expect(callback({ code: undefined, error })).resolves.toMatchObject({
            failure: SsoAuthFailure.PROVIDER_ERROR,
          });
        }
      );

      it('sends a declined consent back to the screen it started from', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.SIGNUP));

        await expect(callback({ code: undefined, error: 'access_denied' })).resolves.toEqual({
          ok: false,
          failure: SsoAuthFailure.ACCESS_DENIED,
          redirectUrl: `${SSO_REDIRECT.SIGNUP}?error=${SsoAuthFailure.ACCESS_DENIED}&provider=microsoft`,
        });
      });

      it('maps any provider or ID-token failure to PROVIDER_ERROR instead of throwing mid-navigation', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));
        microsoftIdentityProvider.fetchIdentity.mockRejectedValue(new Error('nonce mismatch'));

        await expect(callback()).resolves.toMatchObject({ failure: SsoAuthFailure.PROVIDER_ERROR });
        await expect(callback({ code: '' })).resolves.toMatchObject({
          failure: SsoAuthFailure.PROVIDER_ERROR,
        });
      });

      /** The nOAuth defence: an address Microsoft has not domain-verified must never link or create anything. */
      it.each([OAuthIntent.LOGIN, OAuthIntent.SIGNUP])(
        'refuses an unverified email for a first-time identity (%s) without linking or creating',
        async intent => {
          oauthStateService.consume.mockResolvedValue(record(intent));
          microsoftIdentityProvider.fetchIdentity.mockResolvedValue({
            ...identity,
            emailVerified: false,
          });
          authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });

          await expect(callback()).resolves.toMatchObject({
            failure: SsoAuthFailure.EMAIL_NOT_VERIFIED,
          });
          expect(authDbService.linkSsoIdentityByEmail).not.toHaveBeenCalled();
          expect(pendingSsoSignupService.mint).not.toHaveBeenCalled();
        }
      );

      it('still signs in a returning identity matched on sub when the token carries no verified email', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));
        microsoftIdentityProvider.fetchIdentity.mockResolvedValue({
          ...identity,
          emailVerified: false,
        });
        authDbService.findSsoIdentityBySub.mockResolvedValue({
          kind: 'known',
          user: resolvedUser,
          firstActivation: false,
        });
        authDbService.findTenantStatus.mockResolvedValue(activeTenant);

        await expect(callback()).resolves.toMatchObject({ ok: true, kind: 'signed_in' });
      });

      it('links a verified email to the existing account, normalizing it first', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));
        microsoftIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });
        authDbService.linkSsoIdentityByEmail.mockResolvedValue({
          kind: 'known',
          user: resolvedUser,
          firstActivation: false,
        });
        authDbService.findTenantStatus.mockResolvedValue(activeTenant);

        await expect(callback()).resolves.toMatchObject({ ok: true, kind: 'signed_in' });
        expect(authDbService.linkSsoIdentityByEmail).toHaveBeenCalledWith({
          provider: SsoProvider.MICROSOFT,
          providerUserId: 'ms-sub-1',
          email: 'owner@acme.test',
        });
      });

      it('never consults platform-admin identities: no admin has a Microsoft identity', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));
        microsoftIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });

        await callback();

        expect(platformAdminAuthService.findLinkedAdmin).not.toHaveBeenCalled();
      });

      it('refuses a pending team invite with INVITE_REQUIRED instead of signing the invitee in', async () => {
        microsoftIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });
        authDbService.linkSsoIdentityByEmail.mockResolvedValue({ kind: 'invited' });
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));

        await expect(callback()).resolves.toMatchObject({
          failure: SsoAuthFailure.INVITE_REQUIRED,
        });
      });

      it('answers NO_ACCOUNT for an unknown login, and a pending business-name step for a signup', async () => {
        microsoftIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });
        authDbService.linkSsoIdentityByEmail.mockResolvedValue({ kind: 'unknown' });

        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));
        await expect(callback()).resolves.toMatchObject({ failure: SsoAuthFailure.NO_ACCOUNT });

        pendingSsoSignupService.mint.mockResolvedValue('pending-nonce');
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.SIGNUP));
        await expect(callback()).resolves.toEqual({
          ok: true,
          kind: 'needs_business_name',
          pendingSignupCookie: 'pending-nonce',
        });
        expect(pendingSsoSignupService.mint).toHaveBeenCalledWith({
          provider: SsoProvider.MICROSOFT,
          providerUserId: 'ms-sub-1',
          email: 'owner@acme.test',
          name: 'Jane Doe',
        });
      });

      it('refuses a disabled user and a suspended tenant, minting no tokens', async () => {
        oauthStateService.consume.mockResolvedValue(record(OAuthIntent.LOGIN));
        microsoftIdentityProvider.fetchIdentity.mockResolvedValue(identity);
        authDbService.findSsoIdentityBySub.mockResolvedValue({
          kind: 'known',
          user: { ...resolvedUser, status: UserStatus.DISABLED },
          firstActivation: false,
        });
        await expect(callback()).resolves.toMatchObject({
          failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE,
        });

        authDbService.findSsoIdentityBySub.mockResolvedValue({
          kind: 'known',
          user: resolvedUser,
          firstActivation: false,
        });
        authDbService.findTenantStatus.mockResolvedValue({
          status: TenantStatus.SUSPENDED,
          name: 'Test Tenant',
        });
        await expect(callback()).resolves.toMatchObject({
          failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE,
        });
        expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
      });
    });
  });

  describe('validateMemberInvite', () => {
    it('returns the invited email for a live token', async () => {
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });

      await expect(target.validateMemberInvite('raw-token-1')).resolves.toEqual({
        email: 'sam.rivera@thecoffeehouse.com',
      });
    });

    it('throws 404 for a token that never existed, was already used, or has expired', async () => {
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue(null);

      await expect(target.validateMemberInvite('bad-token')).rejects.toThrow(NotFoundException);
    });
  });

  describe('acceptMemberInvite', () => {
    it('signs the member in on success, with a real refresh token (unlike admin acceptance)', async () => {
      authDbService.acceptMemberInviteWithPassword.mockResolvedValue({
        outcome: 'accepted',
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'sam.rivera@thecoffeehouse.com',
        name: 'Sam Rivera',
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'The Coffee House',
      });

      const result = await target.acceptMemberInvite({
        token: 'raw-token-1',
        name: 'Sam Rivera',
        password: 'NewStr0ng@Pass',
      });

      expect(authDbService.acceptMemberInviteWithPassword).toHaveBeenCalledWith({
        tokenHash: expect.any(String) as string,
        name: 'Sam Rivera',
        passwordHash: 'hashed-password',
      });
      expect(result.body.accessToken).toBe('access');
      expect(result.refreshToken).toBe('refresh');
    });

    it('throws 400 for an invalid/expired/already-used token', async () => {
      authDbService.acceptMemberInviteWithPassword.mockResolvedValue({ outcome: 'invalid' });

      await expect(
        target.acceptMemberInvite({
          token: 'bad-token',
          name: 'Sam Rivera',
          password: 'NewStr0ng@Pass',
        })
      ).rejects.toThrow(BadRequestException);
    });

    /**
     * Refused before `acceptMemberInviteWithPassword` runs, so the invite survives a refused
     * attempt.
     */
    it("refuses a suspended tenant's invite before the invite is consumed", async () => {
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'The Coffee House',
      });

      await expect(
        target.acceptMemberInvite({
          token: 'raw-token-1',
          name: 'Sam Rivera',
          password: 'NewStr0ng@Pass',
        })
      ).rejects.toThrow(ForbiddenException);

      expect(authDbService.acceptMemberInviteWithPassword).not.toHaveBeenCalled();
    });
  });

  describe('buildMemberInviteGoogleRedirect', () => {
    it('redirects to the accept page with an error, without minting state, for a dead token', async () => {
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue(null);

      const redirect = await target.buildMemberInviteGoogleRedirect('bad-token');

      expect(redirect).toEqual({
        ok: false,
        redirectUrl: `https://app.innopeak.test/accept-invite/bad-token?error=${SsoAuthFailure.INVALID_OR_EXPIRED_INVITE}`,
      });
      expect(oauthStateService.mint).not.toHaveBeenCalled();
    });

    it('answers with a redirect rather than throwing when the client is unconfigured', async () => {
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });
      googleIdentityProvider.isConfigured.mockReturnValue(false);

      const redirect = await target.buildMemberInviteGoogleRedirect('raw-token-1');

      expect(redirect).toEqual({
        ok: false,
        redirectUrl: `https://app.innopeak.test/accept-invite/raw-token-1?error=${SsoAuthFailure.NOT_CONFIGURED}`,
      });
    });

    it('refuses to start Google for an invite while the platform has Google switched off', async () => {
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });
      platformSettingsDbService.get.mockResolvedValue({ googleLoginEnabled: false });

      const redirect = await target.buildMemberInviteGoogleRedirect('raw-token-1');

      expect(redirect).toEqual({
        ok: false,
        redirectUrl: `https://app.innopeak.test/accept-invite/raw-token-1?error=${SsoAuthFailure.NOT_CONFIGURED}`,
      });
      expect(oauthStateService.mint).not.toHaveBeenCalled();
    });

    it('mints state carrying the INVITE intent and the invite token', async () => {
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });

      await target.buildMemberInviteGoogleRedirect('raw-token-1');

      expect(oauthStateService.mint).toHaveBeenCalledWith({
        provider: SsoProvider.GOOGLE,
        intent: OAuthIntent.INVITE,
        inviteToken: 'raw-token-1',
        pkce: true,
      });
    });
  });

  describe('Google sign-in — member invite dispatch', () => {
    const identity = {
      providerUserId: 'google-sub-1',
      email: 'Sam.Rivera@TheCoffeeHouse.com',
      emailVerified: true,
      name: 'Sam Rivera',
    };

    function consumeInviteState(): void {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.INVITE,
          sidHash: 'h',
          inviteToken: 'raw-token-1',
        },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
    }

    it('signs the member in on success, normalizing the email comparison', async () => {
      consumeInviteState();
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });
      authDbService.acceptMemberInviteWithGoogleIdentity.mockResolvedValue({
        outcome: 'accepted',
        id: 'user-1',
        tenantId: 'tenant-1',
        email: 'sam.rivera@thecoffeehouse.com',
        name: 'Sam Rivera',
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'The Coffee House',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(authDbService.acceptMemberInviteWithGoogleIdentity).toHaveBeenCalledWith({
        tokenHash: expect.any(String) as string,
        providerUserId: 'google-sub-1',
        email: 'Sam.Rivera@TheCoffeeHouse.com',
        name: 'Sam Rivera',
      });
      expect(outcome).toMatchObject({ ok: true, kind: 'signed_in' });
      // Never falls through to tenant login/signup resolution for this intent.
      expect(authDbService.findSsoIdentityBySub).not.toHaveBeenCalled();
    });

    it('redirects to the accept page with an error for a dead token', async () => {
      consumeInviteState();
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue(null);

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.INVALID_OR_EXPIRED_INVITE,
        redirectUrl: `https://app.innopeak.test/accept-invite/raw-token-1?error=${SsoAuthFailure.INVALID_OR_EXPIRED_INVITE}&provider=google`,
      });
      expect(authDbService.acceptMemberInviteWithGoogleIdentity).not.toHaveBeenCalled();
    });

    /**
     * Stops someone other than the invited person redeeming the link with an unrelated Google
     * account.
     */
    it('rejects a Google account whose email does not match the invited address, leaving the token unconsumed', async () => {
      consumeInviteState();
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'someone-else@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.INVITE_EMAIL_MISMATCH,
        redirectUrl: `https://app.innopeak.test/accept-invite/raw-token-1?error=${SsoAuthFailure.INVITE_EMAIL_MISMATCH}&provider=google`,
      });
      expect(authDbService.acceptMemberInviteWithGoogleIdentity).not.toHaveBeenCalled();
    });

    /**
     * Refused as a redirect before `acceptMemberInviteWithGoogleIdentity` runs, never as a thrown
     * 403 (browser is mid-navigation); the invite must survive.
     */
    it("redirects with ACCOUNT_UNAVAILABLE for a suspended tenant's invite, leaving it unconsumed", async () => {
      consumeInviteState();
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'The Coffee House',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE,
        redirectUrl: `https://app.innopeak.test/accept-invite/raw-token-1?error=${SsoAuthFailure.ACCOUNT_UNAVAILABLE}&provider=google`,
      });
      expect(authDbService.acceptMemberInviteWithGoogleIdentity).not.toHaveBeenCalled();
    });

    it('reports an already-linked Google identity distinctly, without a second guess about the token', async () => {
      consumeInviteState();
      authDbService.findMemberInviteEmailByTokenHash.mockResolvedValue({
        email: 'sam.rivera@thecoffeehouse.com',
        tenantId: 'tenant-1',
      });
      authDbService.acceptMemberInviteWithGoogleIdentity.mockResolvedValue({
        outcome: 'identity_already_linked',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED,
        redirectUrl: `https://app.innopeak.test/accept-invite/raw-token-1?error=${SsoAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED}&provider=google`,
      });
    });

    it('sends an intent-agnostic failure (e.g. access denied) to the accept page, not /login', async () => {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.INVITE,
          sidHash: 'h',
          inviteToken: 'raw-token-1',
        },
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: 'access_denied',
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.ACCESS_DENIED,
        redirectUrl: `https://app.innopeak.test/accept-invite/raw-token-1?error=${SsoAuthFailure.ACCESS_DENIED}&provider=google`,
      });
    });
  });

  /** Dispatch only; the business logic is covered in `PlatformAdminAuthService`'s own spec. */
  describe('Google sign-in — admin dispatch', () => {
    const identity = {
      providerUserId: 'google-sub-1',
      email: 'priya.ops@innopeak.com',
      emailVerified: true,
      name: 'Priya',
    };

    const adminTokens = {
      admin: true as const,
      body: {
        accessToken: 'admin-access',
        expiresIn: 900,
        admin: { id: 'admin-1', email: 'priya.ops@innopeak.com', locale: null },
      },
    };

    function consumeAdminLoginState(): void {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.ADMIN_LOGIN,
          sidHash: 'h',
        },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
    }

    it('signs in a linked admin on OAuthIntent.ADMIN_LOGIN', async () => {
      consumeAdminLoginState();
      platformAdminAuthService.findLinkedAdmin.mockResolvedValue({
        linked: true,
        active: true,
        tokens: adminTokens,
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({ ok: true, kind: 'admin_signed_in', tokens: adminTokens });
    });

    /**
     * ADMIN_LOGIN is its own intent so the admin sign-in screen never resolves to a tenant session;
     * NO_ACCOUNT is the dead end.
     */
    it('never falls through to the tenant tables when the Google account is not a linked admin', async () => {
      consumeAdminLoginState();
      platformAdminAuthService.findLinkedAdmin.mockResolvedValue({ linked: false });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(authDbService.findSsoIdentityBySub).not.toHaveBeenCalled();
      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.NO_ACCOUNT,
        redirectUrl: `/admin-login?error=${SsoAuthFailure.NO_ACCOUNT}&provider=google`,
      });
    });

    it('sends a disabled linked admin back to the admin sign-in page', async () => {
      consumeAdminLoginState();
      platformAdminAuthService.findLinkedAdmin.mockResolvedValue({ linked: true, active: false });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.ACCOUNT_UNAVAILABLE,
        redirectUrl: `/admin-login?error=${SsoAuthFailure.ACCOUNT_UNAVAILABLE}&provider=google`,
      });
    });

    /**
     * Intent-agnostic failures resolve before per-intent dispatch but must still land somewhere an
     * admin can act on; `/login` carries no admin path.
     */
    it('sends an intent-agnostic ADMIN_LOGIN failure to the admin page, not the tenant login', async () => {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.ADMIN_LOGIN,
          sidHash: 'h',
        },
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: 'access_denied',
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.ACCESS_DENIED,
        redirectUrl: `/admin-login?error=${SsoAuthFailure.ACCESS_DENIED}&provider=google`,
      });
    });

    it('delegates OAuthIntent.ADMIN_INVITE entirely to PlatformAdminAuthService, on success', async () => {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.ADMIN_INVITE,
          sidHash: 'h',
          inviteToken: 'raw-token-1',
        },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      const tokens = {
        admin: true as const,
        body: {
          accessToken: 'admin-access',
          expiresIn: 900,
          admin: { id: 'admin-1', email: 'priya.ops@innopeak.com', locale: null },
        },
      };
      platformAdminAuthService.completeAdminInviteGoogle.mockResolvedValue({ ok: true, tokens });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(platformAdminAuthService.completeAdminInviteGoogle).toHaveBeenCalledWith(
        'raw-token-1',
        identity
      );
      expect(outcome).toEqual({ ok: true, kind: 'admin_signed_in', tokens });
      // Never falls through to tenant resolution for this intent.
      expect(authDbService.findSsoIdentityBySub).not.toHaveBeenCalled();
    });

    it('maps a PlatformAdminAuthService failure straight through, on ADMIN_INVITE', async () => {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.ADMIN_INVITE,
          sidHash: 'h',
          inviteToken: 'raw-token-1',
        },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminAuthService.completeAdminInviteGoogle.mockResolvedValue({
        ok: false,
        failure: SsoAuthFailure.INVITE_EMAIL_MISMATCH,
        redirectUrl: 'https://app.innopeak.test/invite/raw-token-1?error=INVITE_EMAIL_MISMATCH',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.INVITE_EMAIL_MISMATCH,
        redirectUrl:
          'https://app.innopeak.test/invite/raw-token-1?error=INVITE_EMAIL_MISMATCH&provider=google',
      });
    });

    /**
     * Intent-agnostic failures must still target the accept-invite page, not `/login`, via
     * `PlatformAdminAuthService.adminInviteFailureUrl`.
     */
    it('targets the accept-invite page, not /login, for an intent-agnostic failure under ADMIN_INVITE', async () => {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.ADMIN_INVITE,
          sidHash: 'h',
          inviteToken: 'raw-token-1',
        },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue({ ...identity, emailVerified: false });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(platformAdminAuthService.adminInviteFailureUrl).toHaveBeenCalledWith(
        'raw-token-1',
        SsoAuthFailure.EMAIL_NOT_VERIFIED
      );
      expect(outcome).toEqual({
        ok: false,
        failure: SsoAuthFailure.EMAIL_NOT_VERIFIED,
        redirectUrl: `https://app.innopeak.test/invite/raw-token-1?error=${SsoAuthFailure.EMAIL_NOT_VERIFIED}&provider=google`,
      });
      expect(platformAdminAuthService.completeAdminInviteGoogle).not.toHaveBeenCalled();
    });

    // An admin and a tenant user may share an address (an admin can own a separate business), so the tenant buttons never consult admin
    // identities: the admin console has its own entry (`ADMIN_LOGIN`).
    const tenantRecord = (intent: OAuthIntent) => ({
      ok: true as const,
      record: { provider: SsoProvider.GOOGLE, nonce: 'n', intent, sidHash: 'h' },
    });
    const callbackArgs = {
      code: 'auth-code',
      state: 'signed-state',
      error: undefined,
      sid: 'raw-sid',
    };

    it('links a tenant user holding the same address as a platform admin, without asking whether the account is an admin', async () => {
      oauthStateService.consume.mockResolvedValue(tenantRecord(OAuthIntent.LOGIN));
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });
      authDbService.linkSsoIdentityByEmail.mockResolvedValue({
        kind: 'known',
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'priya.ops@innopeak.com',
          name: 'Priya',
          role: UserRole.OWNER,
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          locale: null,
        },
        firstActivation: false,
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });

      const outcome = await target.handleGoogleCallback(callbackArgs);

      expect(platformAdminAuthService.findLinkedAdmin).not.toHaveBeenCalled();
      expect(authDbService.linkSsoIdentityByEmail).toHaveBeenCalled();
      expect(outcome).toMatchObject({ ok: true, kind: 'signed_in' });
    });

    it('answers NO_ACCOUNT on a tenant login when no tenant user matches, even if the account is a platform admin', async () => {
      oauthStateService.consume.mockResolvedValue(tenantRecord(OAuthIntent.LOGIN));
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });
      authDbService.linkSsoIdentityByEmail.mockResolvedValue({ kind: 'unknown' });

      const outcome = await target.handleGoogleCallback(callbackArgs);

      expect(platformAdminAuthService.findLinkedAdmin).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ ok: false, failure: SsoAuthFailure.NO_ACCOUNT });
    });

    it('lets an admin sign up their own tenant: a signup with no matching tenant user goes to the business-name step', async () => {
      oauthStateService.consume.mockResolvedValue(tenantRecord(OAuthIntent.SIGNUP));
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });
      authDbService.linkSsoIdentityByEmail.mockResolvedValue({ kind: 'unknown' });
      pendingSsoSignupService.mint.mockResolvedValue('pending-signup-cookie');

      const outcome = await target.handleGoogleCallback(callbackArgs);

      expect(platformAdminAuthService.findLinkedAdmin).not.toHaveBeenCalled();
      expect(outcome).toEqual({
        ok: true,
        kind: 'needs_business_name',
        pendingSignupCookie: 'pending-signup-cookie',
      });
    });

    it('signs into the existing tenant, not the admin console, when a Google account is linked to both', async () => {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.LOGIN,
          sidHash: 'h',
        },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      authDbService.findSsoIdentityBySub.mockResolvedValue({
        kind: 'known',
        user: {
          id: 'user-1',
          tenantId: 'tenant-1',
          email: 'priya.ops@innopeak.com',
          name: 'Priya',
          role: UserRole.OWNER,
          passwordHash: 'hashed',
          status: UserStatus.ACTIVE,
          locale: null,
        },
        firstActivation: false,
      });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      // The tenant buttons never ask whether the account is also an admin.
      expect(platformAdminAuthService.findLinkedAdmin).not.toHaveBeenCalled();
      expect(outcome).toMatchObject({ ok: true, kind: 'signed_in' });
    });

    it('resolves a plain tenant account the ordinary way', async () => {
      oauthStateService.consume.mockResolvedValue({
        ok: true as const,
        record: {
          provider: SsoProvider.GOOGLE,
          nonce: 'n',
          intent: OAuthIntent.LOGIN,
          sidHash: 'h',
        },
      });
      googleIdentityProvider.fetchIdentity.mockResolvedValue(identity);
      platformAdminAuthService.findLinkedAdmin.mockResolvedValue({ linked: false });
      authDbService.findSsoIdentityBySub.mockResolvedValue({ kind: 'unknown' });

      const outcome = await target.handleGoogleCallback({
        code: 'auth-code',
        state: 'signed-state',
        error: undefined,
        sid: 'raw-sid',
      });

      expect(authDbService.findSsoIdentityBySub).toHaveBeenCalled();
      expect(outcome).toMatchObject({ failure: SsoAuthFailure.NO_ACCOUNT });
    });
  });
});
