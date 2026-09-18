import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { EnvConfig } from '@config/env.config';
import type { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { UserRole } from '../enums/user-role.enum';

describe('JwtStrategy', () => {
  let target: JwtStrategy;
  let platformAdminDbService: { findStatusById: jest.Mock };

  beforeEach(() => {
    const configService = {
      get: jest.fn(() => 'access-secret'),
    } as unknown as ConfigService<EnvConfig>;
    platformAdminDbService = { findStatusById: jest.fn() };
    target = new JwtStrategy(
      configService,
      platformAdminDbService as unknown as PlatformAdminDbService
    );
  });

  it('maps a tenant_user payload to a TenantAuthUser, passing through a supported locale claim', async () => {
    await expect(
      target.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        role: UserRole.OWNER,
        locale: 'de',
        type: JwtTokenType.TENANT_USER,
      })
    ).resolves.toEqual({
      type: JwtTokenType.TENANT_USER,
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'jane@thecoffeehouse.com',
      role: UserRole.OWNER,
      locale: 'de',
    });
    // A tenant token is never re-checked against the DB — only platform admins pay for that.
    expect(platformAdminDbService.findStatusById).not.toHaveBeenCalled();
  });

  it('defaults locale to null for a token signed before the claim existed, or carrying a bogus value', async () => {
    await expect(
      target.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        role: UserRole.OWNER,
        type: JwtTokenType.TENANT_USER,
      })
    ).resolves.toMatchObject({ locale: null });

    await expect(
      target.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        role: UserRole.OWNER,
        locale: 'fr',
        type: JwtTokenType.TENANT_USER,
      })
    ).resolves.toMatchObject({ locale: null });
  });

  it('maps an ACTIVE platform_admin payload to a PlatformAdminAuthUser', async () => {
    platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.ACTIVE);

    await expect(
      target.validate({
        sub: 'admin-1',
        email: 'root@innopeak.io',
        type: JwtTokenType.PLATFORM_ADMIN,
      })
    ).resolves.toEqual({
      type: JwtTokenType.PLATFORM_ADMIN,
      id: 'admin-1',
      email: 'root@innopeak.io',
      locale: null,
    });
    expect(platformAdminDbService.findStatusById).toHaveBeenCalledWith('admin-1');
  });

  /** Same claim-passthrough the tenant branch gets — a platform admin who has chosen a locale
   *  must see it on every request, not just the one right after they changed it. */
  it("carries a platform_admin payload's locale claim through to the returned user", async () => {
    platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.ACTIVE);

    await expect(
      target.validate({
        sub: 'admin-1',
        email: 'root@innopeak.io',
        locale: 'de',
        type: JwtTokenType.PLATFORM_ADMIN,
      })
    ).resolves.toEqual({
      type: JwtTokenType.PLATFORM_ADMIN,
      id: 'admin-1',
      email: 'root@innopeak.io',
      locale: 'de',
    });
  });

  /**
   * The per-request status re-check: a disabled admin's still-valid JWT must stop working on the
   * very next request, not linger for the token's 15-minute life.
   */
  it('rejects a platform_admin whose row is now DISABLED, even with a valid token', async () => {
    platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.DISABLED);

    await expect(
      target.validate({
        sub: 'admin-1',
        email: 'root@innopeak.io',
        type: JwtTokenType.PLATFORM_ADMIN,
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a platform_admin whose row was deleted (status lookup returns null)', async () => {
    platformAdminDbService.findStatusById.mockResolvedValue(null);

    await expect(
      target.validate({
        sub: 'admin-1',
        email: 'root@innopeak.io',
        type: JwtTokenType.PLATFORM_ADMIN,
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a payload with no type claim instead of defaulting it to a tenant user', async () => {
    await expect(
      target.validate({ sub: 'user-1', email: 'jane@thecoffeehouse.com', role: UserRole.OWNER })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a refresh token presented as a bearer token', async () => {
    await expect(
      target.validate({
        sub: 'user-1',
        email: 'jane@thecoffeehouse.com',
        type: JwtTokenType.REFRESH,
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a tenant_user payload missing tenantId or carrying an unknown role', async () => {
    await expect(
      target.validate({
        sub: 'user-1',
        email: 'jane@thecoffeehouse.com',
        role: UserRole.OWNER,
        type: JwtTokenType.TENANT_USER,
      })
    ).rejects.toThrow(UnauthorizedException);

    await expect(
      target.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        role: 'superuser',
        type: JwtTokenType.TENANT_USER,
      })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a payload without a string sub/email', async () => {
    await expect(target.validate({ type: JwtTokenType.PLATFORM_ADMIN })).rejects.toThrow(
      UnauthorizedException
    );
  });
});
