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

  // No session yet, so no session cookies; but the browser that just proved the password gets the binding that lets it finish verification.
  it('sets only the signup binding for a pending_verification result', async () => {
    login.mockResolvedValue({
      pendingVerification: true,
      body: {
        status: 'pending_verification',
        email: 'jane@thecoffeehouse.com',
        message: 'Verification code sent',
      },
      signupBinding: 'binding-token',
    });
    const res = mockResponse();

    const response = await controller.login(
      { email: 'jane@thecoffeehouse.com', password: 'x' },
      res
    );

    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalledWith(
      'signup_binding',
      'binding-token',
      expect.objectContaining({ httpOnly: true, path: '/v1/auth' })
    );
    // Never in the body: only the cookie carries it.
    expect(JSON.stringify(response)).not.toContain('binding-token');
  });
});

describe('AuthController — password sign-up binding', () => {
  let controller: AuthController;
  const signup = jest.fn();
  const verifyEmail = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { signup, verifyEmail } },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  const dto = {
    businessName: 'Coffee House',
    ownerName: 'Jane',
    email: 'jane@thecoffeehouse.com',
    password: 'StrongP@ss1',
  };

  describe('signup', () => {
    it('gives the browser that signed up the binding that lets it finish, in a cookie and never the body', async () => {
      signup.mockResolvedValue({
        body: { tenantId: 't', userId: 'u', status: 'pending_verification', message: 'sent' },
        signupBinding: 'binding-token',
      });
      const res = mockResponse();

      const response = await controller.signup(dto, res);

      expect(res.cookie).toHaveBeenCalledTimes(1);
      expect(res.cookie).toHaveBeenCalledWith(
        'signup_binding',
        'binding-token',
        expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/v1/auth' })
      );
      expect(JSON.stringify(response)).not.toContain('binding-token');
    });
  });

  describe('verifyEmail', () => {
    const verifyRequest = (cookies: Record<string, string>): Request =>
      ({ cookies }) as unknown as Request;
    const issued = {
      refreshToken: 'refresh',
      body: { accessToken: 'access', expiresIn: 900, user: {}, hasConnectedBusiness: false },
    };

    it("hands the service the browser's binding cookie, and spends it on success", async () => {
      verifyEmail.mockResolvedValue(issued);
      const res = mockResponse();

      await controller.verifyEmail(
        { email: dto.email, otp: '123456' },
        verifyRequest({ signup_binding: 'binding-token' }),
        res
      );

      expect(verifyEmail).toHaveBeenCalledWith(
        { email: dto.email, otp: '123456' },
        'binding-token'
      );
      expect(res.clearCookie).toHaveBeenCalledWith('signup_binding', expect.anything());
      expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'refresh', expect.anything());
    });

    it('passes undefined when the browser has no binding, which the service refuses', async () => {
      verifyEmail.mockRejectedValue(new UnauthorizedException());
      const res = mockResponse();

      await expect(
        controller.verifyEmail({ email: dto.email, otp: '123456' }, verifyRequest({}), res)
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(verifyEmail).toHaveBeenCalledWith({ email: dto.email, otp: '123456' }, undefined);
      expect(res.cookie).not.toHaveBeenCalled();
    });
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

describe('AuthController.logout', () => {
  let controller: AuthController;
  const logout = jest.fn();

  const requestWith = (input: {
    cookies?: Record<string, string>;
    authorization?: string;
  }): Request =>
    ({
      cookies: input.cookies ?? {},
      headers: input.authorization === undefined ? {} : { authorization: input.authorization },
    }) as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();
    logout.mockResolvedValue({ message: 'Logged out' });

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { logout } },
        { provide: AccountDeletionService, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  // A platform admin has no refresh token: the access cookie is the only thing a logout can end for them.
  it('hands the service the refresh cookie and every access token the caller holds when no session hint says whose', async () => {
    await controller.logout(
      requestWith({
        cookies: {
          refresh_token: 'refresh',
          access_token: 'tenant-access',
          admin_access_token: 'admin-access',
        },
        authorization: 'Bearer bearer-access',
      }),
      mockResponse()
    );

    expect(logout).toHaveBeenCalledWith({
      refreshToken: 'refresh',
      accessTokens: ['tenant-access', 'admin-access', 'bearer-access'],
    });
  });

  // Revoking ends a principal's tokens on every device, so only the one signing out (the `session` hint) is revoked: a tenant signing
  // out in a browser that also holds an admin session must not sign that admin out everywhere.
  it.each([
    ['tenant', ['tenant-access', 'bearer-access']],
    ['admin', ['admin-access', 'bearer-access']],
  ])(
    'revokes only the %s session the hint names, plus the Bearer token',
    async (session, expected) => {
      await controller.logout(
        requestWith({
          cookies: {
            session,
            access_token: 'tenant-access',
            admin_access_token: 'admin-access',
          },
          authorization: 'Bearer bearer-access',
        }),
        mockResponse()
      );

      expect(logout).toHaveBeenCalledWith({ refreshToken: undefined, accessTokens: expected });
    }
  );

  it('still succeeds, and clears the cookies, with nothing presented at all', async () => {
    const res = mockResponse();

    await controller.logout(requestWith({}), res);

    expect(logout).toHaveBeenCalledWith({ refreshToken: undefined, accessTokens: [] });
    expect(res.clearCookie).toHaveBeenCalledWith(ADMIN_ACCESS_TOKEN_COOKIE_NAME, expect.anything());
  });
});
