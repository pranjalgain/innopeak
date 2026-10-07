import { MESSAGES } from '@common/constants/messages.constants';
import { HashingService } from '@common/hashing/hashing.service';
import { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { GoogleOAuthStateService } from './google-oauth-state.service';
import { LoginAttemptService } from './login-attempt.service';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { TokenService } from './token.service';

import { GoogleAuthFailure } from '../constants/google-auth.constants';
import { OAuthIntent } from '../enums/oauth-intent.enum';
import { PlatformAdminStatus } from '../enums/platform-admin-status.enum';
import { GoogleIdentityProvider } from '../providers/google-identity.provider';

describe('PlatformAdminAuthService', () => {
  let target: PlatformAdminAuthService;
  let platformAdminDbService: jest.Mocked<PlatformAdminDbService>;
  let hashingService: jest.Mocked<HashingService>;
  let tokenService: jest.Mocked<TokenService>;
  let loginAttemptService: jest.Mocked<LoginAttemptService>;
  let googleOAuthStateService: jest.Mocked<GoogleOAuthStateService>;
  let googleIdentityProvider: jest.Mocked<GoogleIdentityProvider>;

  beforeEach(async () => {
    platformAdminDbService = {
      findForLogin: jest.fn(),
      findInviteEmailByTokenHash: jest.fn(),
      acceptInviteWithPassword: jest.fn(),
      acceptInviteWithGoogleIdentity: jest.fn(),
      findByGoogleIdentity: jest.fn(),
    } as unknown as jest.Mocked<PlatformAdminDbService>;

    hashingService = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn(),
    };

    tokenService = {
      signPlatformAdminAccessToken: jest
        .fn()
        .mockReturnValue({ accessToken: 'admin-access', expiresIn: 900 }),
    } as unknown as jest.Mocked<TokenService>;

    loginAttemptService = {
      isLockedOut: jest.fn().mockResolvedValue(false),
      recordFailure: jest.fn(),
      reset: jest.fn(),
    } as unknown as jest.Mocked<LoginAttemptService>;

    googleOAuthStateService = {
      mint: jest.fn().mockResolvedValue({ state: 'signed-state', sid: 'raw-sid' }),
    } as unknown as jest.Mocked<GoogleOAuthStateService>;

    googleIdentityProvider = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildAuthorizationUrl: jest
        .fn()
        .mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1'),
    } as unknown as jest.Mocked<GoogleIdentityProvider>;

    const configService = {
      get: jest.fn((key: string) => {
        return key === 'FRONTEND_URL' ? 'https://app.innopeak.test' : undefined;
      }),
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlatformAdminAuthService,
        { provide: PlatformAdminDbService, useValue: platformAdminDbService },
        { provide: HashingService, useValue: hashingService },
        { provide: TokenService, useValue: tokenService },
        { provide: LoginAttemptService, useValue: loginAttemptService },
        { provide: GoogleOAuthStateService, useValue: googleOAuthStateService },
        { provide: GoogleIdentityProvider, useValue: googleIdentityProvider },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(PlatformAdminAuthService);
  });

  describe('login', () => {
    const activeAdmin = {
      id: 'admin-1',
      email: 'admin@innopeak.com',
      passwordHash: 'hashed-admin-password',
      status: PlatformAdminStatus.ACTIVE,
      locale: null,
    };

    it('issues a platform-admin access token for a correct password on an active admin', async () => {
      platformAdminDbService.findForLogin.mockResolvedValue(activeAdmin);
      hashingService.compare.mockResolvedValue(true);

      const result = await target.login({ email: activeAdmin.email, password: 'StrongP@ss1' });

      expect(result).toEqual({
        admin: true,
        body: {
          accessToken: 'admin-access',
          expiresIn: 900,
          // `locale` rides along so the client can restore the admin's saved language before its
          // own cookie exists.
          admin: { id: 'admin-1', email: activeAdmin.email, locale: activeAdmin.locale },
        },
      });
    });

    it('throws 401 when no admin exists at that email, still paying for a real comparison', async () => {
      platformAdminDbService.findForLogin.mockResolvedValue(null);

      await expect(target.login({ email: 'nobody@innopeak.com', password: 'x' })).rejects.toThrow(
        UnauthorizedException
      );
      expect(hashingService.compare).toHaveBeenCalledWith('x', expect.any(String));
    });

    it('throws 401 when the password does not match', async () => {
      platformAdminDbService.findForLogin.mockResolvedValue(activeAdmin);
      hashingService.compare.mockResolvedValue(false);

      await expect(target.login({ email: activeAdmin.email, password: 'wrong' })).rejects.toThrow(
        UnauthorizedException
      );
      expect(hashingService.compare).toHaveBeenCalledWith('wrong', activeAdmin.passwordHash);
    });

    /**
     * An invited admin has no password, so this must fail the same way and in the same time as a
     * wrong password, never a distinct "not accepted yet" that confirms a real invite.
     */
    it('throws 401 for an invited admin with no password set yet, same message as a wrong password', async () => {
      platformAdminDbService.findForLogin.mockResolvedValue({
        ...activeAdmin,
        passwordHash: null,
        status: PlatformAdminStatus.INVITED,
      });

      await expect(target.login({ email: activeAdmin.email, password: 'x' })).rejects.toThrow(
        MESSAGES.AUTH.INVALID_CREDENTIALS
      );
      expect(hashingService.compare).toHaveBeenCalledTimes(1);
    });

    it('throws 403 for a disabled admin who still remembers the right password', async () => {
      platformAdminDbService.findForLogin.mockResolvedValue({
        ...activeAdmin,
        status: PlatformAdminStatus.DISABLED,
      });
      hashingService.compare.mockResolvedValue(true);

      await expect(
        target.login({ email: activeAdmin.email, password: 'StrongP@ss1' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('locks out after too many failed attempts, still paying for a decoy comparison', async () => {
      loginAttemptService.isLockedOut.mockResolvedValue(true);

      await expect(target.login({ email: activeAdmin.email, password: 'x' })).rejects.toThrow(
        UnauthorizedException
      );
      expect(platformAdminDbService.findForLogin).not.toHaveBeenCalled();
      expect(hashingService.compare).toHaveBeenCalledWith('x', expect.any(String));
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
        locale: null,
      });

      const result = await target.acceptAdminInvite({
        token: 'raw-token-1',
        password: 'NewStr0ng@Pass',
      });

      expect(hashingService.hash).toHaveBeenCalledWith('NewStr0ng@Pass');
      expect(result.admin).toBe(true);
      expect(result.body.admin.email).toBe('priya.ops@innopeak.com');
    });

    it('throws 400 for a token that never existed, was used, or has expired', async () => {
      platformAdminDbService.acceptInviteWithPassword.mockResolvedValue({ outcome: 'invalid' });

      await expect(
        target.acceptAdminInvite({ token: 'bad-token', password: 'NewStr0ng@Pass' })
      ).rejects.toThrow(BadRequestException);
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

  /** An admin who accepted via Google has no `password_hash`; this route is their only way back. */
  describe('buildAdminLoginGoogleRedirect', () => {
    it('mints state carrying the ADMIN_LOGIN intent and no invite token', async () => {
      const redirect = await target.buildAdminLoginGoogleRedirect();

      expect(googleOAuthStateService.mint).toHaveBeenCalledWith({
        intent: OAuthIntent.ADMIN_LOGIN,
      });
      expect(redirect).toMatchObject({ ok: true });
    });

    /** Back to the admin screen, never the tenant `/login`, which has no admin path. */
    it('sends an unconfigured client back to the admin sign-in page, not the tenant login', async () => {
      googleIdentityProvider.isConfigured.mockReturnValue(false);

      const redirect = await target.buildAdminLoginGoogleRedirect();

      expect(redirect).toEqual({
        ok: false,
        redirectUrl: `/admin-login?error=${GoogleAuthFailure.NOT_CONFIGURED}`,
      });
      expect(googleOAuthStateService.mint).not.toHaveBeenCalled();
    });
  });

  describe('completeAdminInviteGoogle', () => {
    const identity = {
      providerUserId: 'google-sub-1',
      email: 'Priya.Ops@Innopeak.com',
      emailVerified: true,
      name: 'Priya',
    };

    it('links the identity and signs the admin in when the emails match', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });
      platformAdminDbService.acceptInviteWithGoogleIdentity.mockResolvedValue({
        outcome: 'accepted',
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
        locale: null,
      });

      const outcome = await target.completeAdminInviteGoogle('raw-token-1', identity);

      expect(platformAdminDbService.acceptInviteWithGoogleIdentity).toHaveBeenCalledWith({
        tokenHash: expect.any(String),
        providerUserId: 'google-sub-1',
      });
      expect(outcome).toMatchObject({ ok: true });
    });

    /**
     * Stops someone other than the invited person redeeming the link with an unrelated Google
     * account.
     */
    it('rejects a Google account whose verified email does not match the invited address, without linking anything', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });

      const outcome = await target.completeAdminInviteGoogle('raw-token-1', {
        ...identity,
        email: 'someone-else@innopeak.com',
      });

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.INVITE_EMAIL_MISMATCH,
        redirectUrl: `https://app.innopeak.test/invite/raw-token-1?error=${GoogleAuthFailure.INVITE_EMAIL_MISMATCH}`,
      });
      expect(platformAdminDbService.acceptInviteWithGoogleIdentity).not.toHaveBeenCalled();
    });

    it('reports a Google account already linked to a different admin distinctly from an invalid token', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue({
        email: 'priya.ops@innopeak.com',
      });
      platformAdminDbService.acceptInviteWithGoogleIdentity.mockResolvedValue({
        outcome: 'identity_already_linked',
      });

      const outcome = await target.completeAdminInviteGoogle('raw-token-1', identity);

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.GOOGLE_IDENTITY_ALREADY_LINKED,
      });
    });

    it('rejects a dead token before ever looking at the Google identity outcome', async () => {
      platformAdminDbService.findInviteEmailByTokenHash.mockResolvedValue(null);

      const outcome = await target.completeAdminInviteGoogle('raw-token-1', identity);

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
      });
      expect(platformAdminDbService.acceptInviteWithGoogleIdentity).not.toHaveBeenCalled();
    });

    it('falls back to the login page when the invite token is somehow missing', async () => {
      const outcome = await target.completeAdminInviteGoogle(undefined, identity);

      expect(outcome).toMatchObject({
        ok: false,
        failure: GoogleAuthFailure.INVALID_OR_EXPIRED_INVITE,
      });
      expect(platformAdminDbService.findInviteEmailByTokenHash).not.toHaveBeenCalled();
    });
  });

  describe('findLinkedAdmin', () => {
    it('reports not linked for an unknown Google identity', async () => {
      platformAdminDbService.findByGoogleIdentity.mockResolvedValue(null);

      const result = await target.findLinkedAdmin('unknown-sub');

      expect(result).toEqual({ linked: false });
    });

    it('signs the admin in for a linked, active identity', async () => {
      platformAdminDbService.findByGoogleIdentity.mockResolvedValue({
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
        status: PlatformAdminStatus.ACTIVE,
        locale: null,
      });

      const result = await target.findLinkedAdmin('google-sub-1');

      expect(result).toMatchObject({ linked: true, active: true });
      expect(result.linked && result.active && result.tokens.body.admin.email).toBe(
        'priya.ops@innopeak.com'
      );
    });

    it('reports linked but not active for a disabled admin', async () => {
      platformAdminDbService.findByGoogleIdentity.mockResolvedValue({
        id: 'admin-1',
        email: 'priya.ops@innopeak.com',
        status: PlatformAdminStatus.DISABLED,
        locale: null,
      });

      const result = await target.findLinkedAdmin('google-sub-1');

      expect(result).toEqual({ linked: true, active: false });
    });
  });
});
