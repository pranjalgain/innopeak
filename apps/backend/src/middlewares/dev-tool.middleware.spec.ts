import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';

import { createOpsToolsGuard } from './dev-tool.middleware';

function mockReq(path: string, opts: { cookie?: string; bearer?: string } = {}): Request {
  return {
    path,
    cookies: opts.cookie ? { access_token: opts.cookie } : {},
    headers: opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {},
  } as unknown as Request;
}

function mockRes(): Response & { statusCode?: number; body?: unknown } {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  });
  res.json = jest.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  });
  return res as Response & { statusCode?: number; body?: unknown };
}

describe('createOpsToolsGuard', () => {
  let jwtService: { verify: jest.Mock };
  let configService: { get: jest.Mock };
  let adminStatuses: { findStatusById: jest.Mock };
  let next: NextFunction;

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('test-secret') };
    adminStatuses = { findStatusById: jest.fn().mockResolvedValue(PlatformAdminStatus.ACTIVE) };
    next = jest.fn();
  });

  function guard() {
    return createOpsToolsGuard(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService<EnvConfig>,
      adminStatuses
    );
  }

  it('passes through a request outside the protected prefixes without checking any token', async () => {
    const res = mockRes();
    await guard()(mockReq('/v1/reviews'), res, next);

    expect(next).toHaveBeenCalled();
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('denies a protected path with no token', async () => {
    const res = mockRes();
    await guard()(mockReq('/admin/queues'), res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a valid platform-admin token', async () => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.PLATFORM_ADMIN, sub: 'admin-1' });
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects a valid tenant-user token as forbidden, not authenticated', async () => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.TENANT_USER });
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('denies an invalid/expired token', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('expired');
    });
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { cookie: 'bad-token' }), res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['disabled', PlatformAdminStatus.DISABLED],
    ['deleted', null],
  ])('denies a still-valid token whose admin is %s', async (_label, status) => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.PLATFORM_ADMIN, sub: 'admin-1' });
    adminStatuses.findStatusById.mockResolvedValue(status);
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(adminStatuses.findStatusById).toHaveBeenCalledWith('admin-1');
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 503 rather than letting the request through when the status lookup fails', async () => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.PLATFORM_ADMIN, sub: 'admin-1' });
    adminStatuses.findStatusById.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  // Regression: Express routes case-insensitively, so `/Admin/Queues` still reached Bull Board while bypassing a case-sensitive guard.
  it.each(['/Admin/Queues', '/ADMIN/QUEUES/api/queues'])(
    'still enforces the guard on a differently-cased protected path (%s)',
    async path => {
      const res = mockRes();
      await guard()(mockReq(path), res, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  );
});
