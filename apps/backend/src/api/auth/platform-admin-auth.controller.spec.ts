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
   * Regression target for the admin-login split: only `admin_access_token` and the admin-tagged
   * `session` hint are ever set — never `access_token`/`refresh_token`, and never a `clearCookie`
   * call of any kind. The pre-split version of this login branch had to explicitly
   * `clearCookie(refresh_token)` to defend against a lingering tenant session hijacking this one;
   * that defense is gone here because there is nothing left for it to defend against — the two
   * principals no longer share a cookie name at all.
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
