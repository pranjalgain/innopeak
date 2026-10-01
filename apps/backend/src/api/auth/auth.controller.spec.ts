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
import { UserRole } from './enums/user-role.enum';
import { RefreshTokenSupersededException } from './errors/refresh-token.error';
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
      providers: [{ provide: AuthService, useValue: { refresh } }],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  /**
   * The regression this exists to prevent: `session` is the frontend edge middleware's routing
   * hint (`proxy.ts`), set once at login with its own 7-day `maxAge` — nothing about a failed
   * refresh used to touch it. Leaving it behind a failed rotation (an unknown, revoked, or reused
   * refresh token; a DB reset that emptied `refresh_tokens` out from under a still-cookied
   * browser) made the middleware keep believing the visitor was signed in, bouncing `/login` back
   * to `/dashboard` forever while the client's own hard redirect fought it the other way —
   * `POST /v1/auth/refresh` firing on every bounce until the throttler started rejecting it
   * outright.
   *
   * `admin_access_token` is cleared here too, unconditionally, even though this route can only
   * ever be reached by a tenant session (an admin has no refresh cookie to call it with) — see
   * `AuthController.clearSessionCookies`'s own comment for why clearing every possible session
   * cookie, regardless of which principal is signing out, is what lets `POST /v1/auth/logout`
   * (and, incidentally, this failure path) stay principal-agnostic.
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
   * The regression this exists to prevent, and the reason `RefreshTokenSupersededException`
   * exists at all: two dashboard tabs idle past the access-token TTL both wake and refresh with
   * the same cookie (the frontend single-flights per tab, not across tabs). The winner rotates
   * and `Set-Cookie`s a valid successor; the loser's 401 must not then wipe it, or the user is
   * logged out of every tab and the next refresh has no cookie at all to recover from.
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
    // Same status and message as a genuinely dead session — the cookie handling differs, the
    // HTTP contract deliberately does not (no enumeration signal for a caller to probe).
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
      providers: [{ provide: AuthService, useValue: { updateLocale } }],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  /**
   * The regression this exists to prevent: `updateLocale` is authenticated by an access token
   * alone (see `TokenService.reissueAccessToken`'s doc comment), so it must never mint or set a
   * refresh token — doing so would let a bare access token upgrade itself into a fresh,
   * indefinitely-rotatable 7-day session with no additional proof of identity.
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
      providers: [{ provide: AuthService, useValue: { login } }],
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
      providers: [{ provide: AuthService, useValue: { acceptMemberInvite } }],
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
      providers: [{ provide: AuthService, useValue: { buildMemberInviteGoogleRedirect } }],
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
