import { Test } from '@nestjs/testing';
import type { Response } from 'express';

import {
  ADMIN_ACCESS_TOKEN_COOKIE_NAME,
  SESSION_HINT_COOKIE_NAME,
} from './constants/auth.constants';
import { PlatformAdminAuthController } from './platform-admin-auth.controller';
import { PlatformAdminAuthService } from './services/platform-admin-auth.service';

function mockResponse(): Response {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  } as unknown as Response;
}

describe('PlatformAdminAuthController.login', () => {
  let controller: PlatformAdminAuthController;
  const login = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAdminAuthController],
      providers: [{ provide: PlatformAdminAuthService, useValue: { login } }],
    }).compile();

    controller = moduleRef.get(PlatformAdminAuthController);
  });

  /**
   * Guards: admin login sets only `admin_access_token` and the admin-tagged `session` hint, never
   * `access_token`/`refresh_token` and no `clearCookie` (the principals no longer share cookie names).
   */
  it('sets only the admin access-token cookie and the admin session hint, nothing else', async () => {
    login.mockResolvedValue({
      admin: true,
      body: {
        accessToken: 'admin-access-token',
        expiresIn: 900,
        admin: { id: 'admin-1', email: 'admin@innopeak.com' },
      },
    });
    const res = mockResponse();

    await controller.login({ email: 'admin@innopeak.com', password: 'x' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      ADMIN_ACCESS_TOKEN_COOKIE_NAME,
      'admin-access-token',
      expect.anything()
    );
    expect(res.cookie).toHaveBeenCalledWith(SESSION_HINT_COOKIE_NAME, 'admin', expect.anything());
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe('PlatformAdminAuthController.acceptAdminInvite', () => {
  let controller: PlatformAdminAuthController;
  const acceptAdminInvite = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAdminAuthController],
      providers: [{ provide: PlatformAdminAuthService, useValue: { acceptAdminInvite } }],
    }).compile();

    controller = moduleRef.get(PlatformAdminAuthController);
  });

  it('signs the admin in on acceptance, same cookie shape as login', async () => {
    acceptAdminInvite.mockResolvedValue({
      admin: true,
      body: {
        accessToken: 'admin-access-token',
        expiresIn: 900,
        admin: { id: 'admin-1', email: 'priya.ops@innopeak.com' },
      },
    });
    const res = mockResponse();

    await controller.acceptAdminInvite({ token: 'raw-token-1', password: 'NewStr0ng@Pass' }, res);

    expect(res.cookie).toHaveBeenCalledWith(
      ADMIN_ACCESS_TOKEN_COOKIE_NAME,
      'admin-access-token',
      expect.anything()
    );
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

describe('PlatformAdminAuthController.microsoftLogin', () => {
  let controller: PlatformAdminAuthController;
  const buildAdminLoginMicrosoftRedirect = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAdminAuthController],
      providers: [
        { provide: PlatformAdminAuthService, useValue: { buildAdminLoginMicrosoftRedirect } },
      ],
    }).compile();

    controller = moduleRef.get(PlatformAdminAuthController);
  });

  it('binds the round trip to this browser with the Microsoft binding cookie and redirects to Microsoft', async () => {
    buildAdminLoginMicrosoftRedirect.mockResolvedValue({
      ok: true,
      authorizationUrl: 'https://login.microsoftonline.com/tid/oauth2/v2.0/authorize?x=1',
      sid: 'raw-sid',
    });
    const res = mockResponse();

    await controller.microsoftLogin(res);

    expect(res.cookie).toHaveBeenCalledWith('microsoft_auth_sid', 'raw-sid', expect.anything());
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://login.microsoftonline.com/tid/oauth2/v2.0/authorize?x=1'
    );
  });

  it('redirects straight back to the admin sign-in page, setting no cookie, when it cannot start', async () => {
    buildAdminLoginMicrosoftRedirect.mockResolvedValue({
      ok: false,
      redirectUrl: '/admin-login?error=NOT_CONFIGURED&provider=microsoft',
    });
    const res = mockResponse();

    await controller.microsoftLogin(res);

    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      '/admin-login?error=NOT_CONFIGURED&provider=microsoft'
    );
  });
});
