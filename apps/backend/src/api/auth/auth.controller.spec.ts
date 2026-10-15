import { MESSAGES } from '@common/constants/messages.constants';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';

import { AuthController } from './auth.controller';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_NAME,
  SESSION_HINT_COOKIE_NAME,
} from './constants/auth.constants';
import { JwtTokenType } from './enums/jwt-token-type.enum';
import { OAuthIntent } from './enums/oauth-intent.enum';
import { UserRole } from './enums/user-role.enum';
import { RefreshTokenSupersededException } from './errors/refresh-token.error';
import { AccountDeletionService } from './services/account-deletion.service';
import { AuthService } from './services/auth.service';
import type { TenantAuthUser } from './types/auth.type';

function mockResponse(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
}

function mockRequest(refreshTokenCookie: string | undefined): Request {
  return {
    cookies: refreshTokenCookie === undefined ? {} : { refresh_token: refreshTokenCookie },
  } as unknown as Request;
}

describe('AuthController.refresh', () => {
  let controller: AuthController;
  const refresh = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { refresh } },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  /**
   * Guards: a failed refresh must also clear the `session` hint (and `admin_access_token`), or edge
   * middleware keeps bouncing /login to /dashboard while refresh fires until throttled.
   */
  it('clears every session cookie when the refresh token is rejected', async () => {
    refresh.mockRejectedValue(new UnauthorizedException('Invalid or expired refresh token.'));
    const res = mockResponse();

    await expect(controller.refresh(mockRequest('a-dead-refresh-token'), res)).rejects.toThrow(
      UnauthorizedException
    );

    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE_NAME, expect.anything());
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE_NAME, expect.anything());
    expect(res.clearCookie).toHaveBeenCalledWith(ADMIN_ACCESS_TOKEN_COOKIE_NAME, expect.anything());
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_HINT_COOKIE_NAME, expect.anything());
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('clears all three session cookies when there is no refresh token cookie at all', async () => {
    const res = mockResponse();

    await expect(controller.refresh(mockRequest(undefined), res)).rejects.toThrow(
      UnauthorizedException
    );

    expect(refresh).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith(SESSION_HINT_COOKIE_NAME, expect.anything());
  });

  /**
   * Guards: a refresh that lost a concurrent rotation (`RefreshTokenSupersededException`) must not clear
   * the winner's cookie, or the user is logged out of every tab.
   */
  it('keeps the session cookies when the token merely lost a rotation race', async () => {
    refresh.mockRejectedValue(new RefreshTokenSupersededException());
    const res = mockResponse();

    await expect(
      controller.refresh(mockRequest('a-superseded-refresh-token'), res)
    ).rejects.toThrow(RefreshTokenSupersededException);

    expect(res.clearCookie).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('still reports a superseded token as a 401, indistinguishable from any other bad token', () => {
    // Same status and message as a dead session: no enumeration signal.
    const superseded = new RefreshTokenSupersededException();

    expect(superseded).toBeInstanceOf(UnauthorizedException);
    expect(superseded.getStatus()).toBe(401);
    expect(superseded.message).toBe(
      new UnauthorizedException(MESSAGES.AUTH.INVALID_REFRESH_TOKEN).message
    );
  });

  it('does not touch the session cookies on a non-auth failure — only a confirmed-dead session should clear them', async () => {
    refresh.mockRejectedValue(new Error('connection terminated unexpectedly'));
    const res = mockResponse();

    await expect(controller.refresh(mockRequest('a-refresh-token'), res)).rejects.toThrow(
      'connection terminated unexpectedly'
    );

    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('sets fresh session cookies on a successful rotation, without clearing anything first', async () => {
    refresh.mockResolvedValue({
      refreshToken: 'new-refresh-token',
      body: { accessToken: 'new-access-token' },
    });
    const res = mockResponse();

    await controller.refresh(mockRequest('a-refresh-token'), res);

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE_NAME,
      'new-refresh-token',
      expect.anything()
    );
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_HINT_COOKIE_NAME,
      expect.anything(),
      expect.anything()
    );
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe('AuthController.updateLocale', () => {
  let controller: AuthController;
  const updateLocale = jest.fn();

  const currentUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'owner@example.com',
    role: UserRole.OWNER,
    locale: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { updateLocale } },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  /**
   * Guards: `updateLocale` is authenticated by an access token alone, so it must never mint a refresh token.
   */
  it('sets only the access token cookie, never the refresh token or session hint cookies', async () => {
    updateLocale.mockResolvedValue({
      accessToken: 'new-access-token',
      expiresIn: 900,
      user: { id: 'user-1', locale: 'de' },
    });
    const res = mockResponse();

    await controller.updateLocale(currentUser, { locale: 'de' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE_NAME,
      'new-access-token',
      expect.anything()
    );
    expect(res.cookie).not.toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE_NAME,
      expect.anything(),
      expect.anything()
    );
    expect(res.cookie).not.toHaveBeenCalledWith(
      SESSION_HINT_COOKIE_NAME,
      expect.anything(),
      expect.anything()
    );
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe('AuthController.login', () => {
  let controller: AuthController;
  const login = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('sets all three session cookies on a tenant login', async () => {
    login.mockResolvedValue({
      refreshToken: 'new-refresh-token',
      body: {
        accessToken: 'new-access-token',
        expiresIn: 900,
        user: {},
        hasConnectedBusiness: false,
      },
    });
    const res = mockResponse();

    await controller.login({ email: 'jane@thecoffeehouse.com', password: 'x' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE_NAME,
      'new-refresh-token',
      expect.anything()
    );
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE_NAME,
      'new-access-token',
      expect.anything()
    );
  });

  it('sets no cookies at all for a pending_verification result', async () => {
    login.mockResolvedValue({
      status: 'pending_verification',
      email: 'jane@thecoffeehouse.com',
      message: 'Verification code sent',
    });
    const res = mockResponse();

    await controller.login({ email: 'jane@thecoffeehouse.com', password: 'x' }, res);

    expect(res.cookie).not.toHaveBeenCalled();
  });
});

describe('AuthController.acceptMemberInvite', () => {
  let controller: AuthController;
  const acceptMemberInvite = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { acceptMemberInvite } },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('sets the tenant session cookies on a successful accept — never the admin cookie', async () => {
    acceptMemberInvite.mockResolvedValue({
      refreshToken: 'new-refresh-token',
      body: {
        accessToken: 'new-access-token',
        expiresIn: 900,
        user: {},
        hasConnectedBusiness: true,
      },
    });
    const res = mockResponse();

    await controller.acceptMemberInvite(
      { token: 'raw-token-1', name: 'Sam Rivera', password: 'NewStr0ng@Pass' },
      res
    );

    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE_NAME,
      'new-refresh-token',
      expect.anything()
    );
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE_NAME,
      'new-access-token',
      expect.anything()
    );
    expect(res.cookie).not.toHaveBeenCalledWith(
      ADMIN_ACCESS_TOKEN_COOKIE_NAME,
      expect.anything(),
      expect.anything()
    );
  });
});

describe('AuthController.inviteGoogleAuthorize', () => {
  let controller: AuthController;
  const buildMemberInviteGoogleRedirect = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { buildMemberInviteGoogleRedirect } },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('redirects to the accept page with an error, setting no cookie, for a dead token', async () => {
    buildMemberInviteGoogleRedirect.mockResolvedValue({
      ok: false,
      redirectUrl:
        'https://app.innopeak.test/accept-invite/bad-token?error=INVALID_OR_EXPIRED_INVITE',
    });
    const res = mockResponse();

    await controller.inviteGoogleAuthorize('bad-token', res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://app.innopeak.test/accept-invite/bad-token?error=INVALID_OR_EXPIRED_INVITE'
    );
  });

  it('sets the Google binding cookie and redirects to Google on success', async () => {
    buildMemberInviteGoogleRedirect.mockResolvedValue({
      ok: true,
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
      sid: 'sid-value',
    });
    const res = mockResponse();

    await controller.inviteGoogleAuthorize('raw-token-1', res);

    expect(res.cookie).toHaveBeenCalledWith('google_auth_sid', 'sid-value', expect.anything());
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://accounts.google.com/o/oauth2/v2/auth?...'
    );
  });
});

describe('AuthController — Microsoft sign-in', () => {
  let controller: AuthController;
  const buildMicrosoftAuthorizeRedirect = jest.fn();
  const handleMicrosoftCallback = jest.fn();
  const completeSsoSignup = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { buildMicrosoftAuthorizeRedirect, handleMicrosoftCallback, completeSsoSignup },
        },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  const request = (query: Record<string, string>, cookies: Record<string, string> = {}): Request =>
    ({ query, cookies }) as unknown as Request;

  describe('authorize', () => {
    it('sets the Microsoft binding cookie and redirects to Microsoft', async () => {
      buildMicrosoftAuthorizeRedirect.mockResolvedValue({
        ok: true,
        authorizationUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1',
        sid: 'sid-value',
      });
      const res = mockResponse();

      await controller.microsoftAuthorize({ intent: OAuthIntent.LOGIN }, res);

      expect(res.cookie).toHaveBeenCalledWith('microsoft_auth_sid', 'sid-value', expect.anything());
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?x=1'
      );
    });

    it('redirects with the error and sets no cookie when unconfigured', async () => {
      buildMicrosoftAuthorizeRedirect.mockResolvedValue({
        ok: false,
        redirectUrl: '/login?error=NOT_CONFIGURED',
      });
      const res = mockResponse();

      await controller.microsoftAuthorize({ intent: OAuthIntent.LOGIN }, res);

      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, '/login?error=NOT_CONFIGURED');
    });
  });

  describe('callback', () => {
    it('reads the binding cookie, clears it whatever the outcome, and signs in with the session cookies', async () => {
      handleMicrosoftCallback.mockResolvedValue({
        ok: true,
        kind: 'signed_in',
        tokens: { refreshToken: 'refresh', body: { accessToken: 'access' } },
      });
      const res = mockResponse();

      await controller.microsoftCallback(
        request({ code: 'c', state: 's' }, { microsoft_auth_sid: 'sid-1' }),
        res
      );

      expect(handleMicrosoftCallback).toHaveBeenCalledWith({
        code: 'c',
        state: 's',
        error: undefined,
        sid: 'sid-1',
      });
      expect(res.clearCookie).toHaveBeenCalledWith('microsoft_auth_sid', expect.anything());
      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        'refresh',
        expect.anything()
      );
      expect(res.cookie).toHaveBeenCalledWith(
        ACCESS_TOKEN_COOKIE_NAME,
        'access',
        expect.anything()
      );
      expect(res.redirect).toHaveBeenCalledWith(302, '/dashboard');
    });

    it('hands a brand-new person the shared pending-signup cookie and the business-name step', async () => {
      handleMicrosoftCallback.mockResolvedValue({
        ok: true,
        kind: 'needs_business_name',
        pendingSignupCookie: 'pending-nonce',
      });
      const res = mockResponse();

      await controller.microsoftCallback(request({ code: 'c', state: 's' }), res);

      expect(res.cookie).toHaveBeenCalledWith(
        'sso_pending_signup',
        'pending-nonce',
        expect.anything()
      );
      expect(res.redirect).toHaveBeenCalledWith(302, '/onboarding/business-name');
    });

    it('redirects a failure with its error and sets no session', async () => {
      handleMicrosoftCallback.mockResolvedValue({
        ok: false,
        failure: 'EMAIL_NOT_VERIFIED',
        redirectUrl: '/login?error=EMAIL_NOT_VERIFIED',
      });
      const res = mockResponse();

      await controller.microsoftCallback(request({ code: 'c', state: 's' }), res);

      expect(res.clearCookie).toHaveBeenCalledWith('microsoft_auth_sid', expect.anything());
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(302, '/login?error=EMAIL_NOT_VERIFIED');
    });

    it('signs a platform admin in with the admin cookies only and sends them to the console', async () => {
      handleMicrosoftCallback.mockResolvedValue({
        ok: true,
        kind: 'admin_signed_in',
        tokens: { admin: true, body: { accessToken: 'admin-access' } },
      });
      const res = mockResponse();

      await controller.microsoftCallback(request({ code: 'c', state: 's' }), res);

      expect(res.cookie).toHaveBeenCalledWith(
        ADMIN_ACCESS_TOKEN_COOKIE_NAME,
        'admin-access',
        expect.anything()
      );
      expect(res.cookie).not.toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        expect.anything(),
        expect.anything()
      );
      expect(res.redirect).toHaveBeenCalledWith(302, '/admin');
    });
  });

  describe('complete signup', () => {
    const tokens = { refreshToken: 'refresh', body: { accessToken: 'access' } };

    it('reads the shared pending-signup cookie', async () => {
      completeSsoSignup.mockResolvedValue(tokens);
      const res = mockResponse();

      await controller.completeSsoSignup(
        { businessName: 'Acme' },
        request({}, { sso_pending_signup: 'new-nonce' }),
        res
      );

      expect(completeSsoSignup).toHaveBeenCalledWith('new-nonce', 'Acme');
    });

    // TRANSITIONAL: a Google signup on the business-name step at deploy time still holds the pre-rename cookie.
    it('falls back to the pre-rename Google cookie and clears both', async () => {
      completeSsoSignup.mockResolvedValue(tokens);
      const res = mockResponse();

      await controller.completeSsoSignup(
        { businessName: 'Acme' },
        request({}, { google_pending_signup: 'old-nonce' }),
        res
      );

      expect(completeSsoSignup).toHaveBeenCalledWith('old-nonce', 'Acme');
      expect(res.clearCookie).toHaveBeenCalledWith('sso_pending_signup', expect.anything());
      expect(res.clearCookie).toHaveBeenCalledWith('google_pending_signup', expect.anything());
    });
  });
});
