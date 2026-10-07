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
