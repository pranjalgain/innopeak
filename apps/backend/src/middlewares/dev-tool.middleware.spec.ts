import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';

import { createOpsToolsGuard } from './dev-tool.middleware';

/** `cookie` is the platform admin's `admin_access_token`; `tenantCookie` the tenant `access_token` a browser may hold alongside it. */
function mockReq(
  path: string,
  opts: { cookie?: string; tenantCookie?: string; bearer?: string } = {}
): Request {
  return {
    path,
    cookies: {
      ...(opts.cookie ? { admin_access_token: opts.cookie } : {}),
      ...(opts.tenantCookie ? { access_token: opts.tenantCookie } : {}),
    },
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
  let revocation: { isRevoked: jest.Mock };
  let next: NextFunction;

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('test-secret') };
    adminStatuses = { findStatusById: jest.fn().mockResolvedValue(PlatformAdminStatus.ACTIVE) };
    revocation = { isRevoked: jest.fn().mockResolvedValue(false) };
    next = jest.fn();
  });

  function guard() {
    return createOpsToolsGuard(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService<EnvConfig>,
      adminStatuses,
      revocation
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

  // Regression: the guard read the tenant `access_token` cookie, so a platform admin's browser (which carries
  // `admin_access_token`) was told to authenticate.
  it("reads a platform admin's own cookie, not the tenant one, when a browser holds both", async () => {
    jwtService.verify.mockImplementation((token: string) => {
      if (token === 'admin-token') {
        return { type: JwtTokenType.PLATFORM_ADMIN, sub: 'admin-1' };
      }
      return { type: JwtTokenType.TENANT_USER, sub: 'user-1' };
    });
    const res = mockRes();
    await guard()(
      mockReq('/admin/queues', { cookie: 'admin-token', tenantCookie: 'tenant-token' }),
      res,
      next
    );

    expect(jwtService.verify).toHaveBeenCalledWith('admin-token', expect.anything());
    expect(next).toHaveBeenCalled();
  });

  it('does not treat a tenant session cookie as a credential for this surface', async () => {
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { tenantCookie: 'tenant-token' }), res, next);

    expect(res.statusCode).toBe(401);
    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a valid tenant-user token as forbidden, not authenticated', async () => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.TENANT_USER });
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { bearer: 'token' }), res, next);

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

  // A logout or password change ends the admin's older tokens; Bull Board's job payloads carry OTPs and invite links.
  it('refuses a token issued before the admin logged out or changed their password', async () => {
    jwtService.verify.mockReturnValue({
      type: JwtTokenType.PLATFORM_ADMIN,
      sub: 'admin-1',
      iat: 1_700_000_000,
    });
    revocation.isRevoked.mockResolvedValue(true);
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(revocation.isRevoked).toHaveBeenCalledWith({
      userId: 'admin-1',
      issuedAt: 1_700_000_000,
    });
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('does not ask about revocation for a disabled admin, who is refused first', async () => {
    jwtService.verify.mockReturnValue({ type: JwtTokenType.PLATFORM_ADMIN, sub: 'admin-1' });
    adminStatuses.findStatusById.mockResolvedValue(PlatformAdminStatus.DISABLED);
    const res = mockRes();
    await guard()(mockReq('/admin/queues', { cookie: 'token' }), res, next);

    expect(res.statusCode).toBe(403);
    expect(revocation.isRevoked).not.toHaveBeenCalled();
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
