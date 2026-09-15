import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
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
  let next: NextFunction;

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('test-secret') };
    next = jest.fn();
  });

  function guard() {
    return createOpsToolsGuard(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService<EnvConfig>
    );
  }

  it('passes through a request outside the protected prefixes without checking any token', () => {
    const res = mockRes();
    guard()(mockReq('/v1/reviews'), res, next);

    expect(next).toHaveBeenCalled();
    expect(jwtService.verify).not.toHaveBeenCalled();
  });

  it('denies a protected path with no token', () => {
    const res = mockRes();
    guard()(mockReq('/admin/queues'), res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a valid platform-admin token', () => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.PLATFORM_ADMIN });
    const res = mockRes();
    guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects a valid tenant-user token as forbidden, not authenticated', () => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.TENANT_USER });
    const res = mockRes();
    guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('denies an invalid/expired token', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('expired');
    });
    const res = mockRes();
    guard()(mockReq('/admin/queues', { cookie: 'bad-token' }), res, next);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  /**
   * Regression test: Express's own router matches routes case-insensitively by default, so a
   * differently-cased request (`/Admin/Queues`) still reaches Bull Board's sub-app even though it
   * doesn't literal-match the lowercase `/admin/queues` prefix. A case-sensitive comparison here
   * let such a request skip this guard entirely while Express still routed it through underneath.
   */
  it.each(['/Admin/Queues', '/ADMIN/QUEUES/api/queues', '/Health/Health-UI', '/Dev-Tools'])(
    'still enforces the guard on a differently-cased protected path (%s)',
    path => {
      const res = mockRes();
      guard()(mockReq(path), res, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
  );
});
