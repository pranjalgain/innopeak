import { PlatformAdminStatus } from '@auth/enums/platform-admin-status.enum';
import type { EnvConfig } from '@config/env.config';
import type { PlatformAdminDbService } from '@db/repositories/platform-admin/platform-admin.db-service';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { UserRole } from '../enums/user-role.enum';
import type { SessionRevocationService } from '../services/session-revocation.service';

describe('JwtStrategy', () => {
  let target: JwtStrategy;
  let platformAdminDbService: { findStatusById: jest.Mock };
  let sessionRevocationService: { isRevoked: jest.Mock };

  beforeEach(() => {
    const configService = {
      get: jest.fn(() => 'access-secret'),
    } as unknown as ConfigService<EnvConfig>;
    platformAdminDbService = { findStatusById: jest.fn() };
    sessionRevocationService = { isRevoked: jest.fn().mockResolvedValue(false) };
    target = new JwtStrategy(
      configService,
      platformAdminDbService as unknown as PlatformAdminDbService,
      sessionRevocationService as unknown as SessionRevocationService
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
    // Only platform admins pay for the per-request DB status check.
    expect(platformAdminDbService.findStatusById).not.toHaveBeenCalled();
  });

  // A JWT cannot be taken back, so logout, a password change, a disabled user and a suspended business end an access token through a
  // "not before" mark in Redis instead of leaving it to run out its 15 minutes.
  describe('a revoked session', () => {
    const tenantPayload = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      email: 'jane@thecoffeehouse.com',
      role: UserRole.OWNER,
      type: JwtTokenType.TENANT_USER,
      iat: 1_800_000_000,
    };

    it('asks about this user, this business and when the token was issued', async () => {
      await target.validate(tenantPayload);

      expect(sessionRevocationService.isRevoked).toHaveBeenCalledWith({
        userId: 'user-1',
        tenantId: 'tenant-1',
        issuedAt: 1_800_000_000,
      });
    });

    it('rejects a tenant token issued before a revocation, like any other bad token', async () => {
      sessionRevocationService.isRevoked.mockResolvedValue(true);

      await expect(target.validate(tenantPayload)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('passes a token with no issue time to the check as undefined, which it cannot place in time', async () => {
      const { iat: _iat, ...withoutIat } = tenantPayload;

      await target.validate(withoutIat);

      expect(sessionRevocationService.isRevoked).toHaveBeenCalledWith(
        expect.objectContaining({ issuedAt: undefined })
      );
    });
  });

  // Lets `updateLocale` re-sign to the same deadline: a fresh TTL on every call would let a stolen access token renew itself forever.
  it("carries a tenant token's expiry as sessionExpiresAt", async () => {
    await expect(
      target.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        role: UserRole.OWNER,
        type: JwtTokenType.TENANT_USER,
        exp: 1_900_000_000,
      })
    ).resolves.toMatchObject({ sessionExpiresAt: 1_900_000_000 });
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

  // A chosen locale must persist on every request, not just the one right after the change.
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

  describe('a revoked platform-admin session', () => {
    const adminClaims = {
      sub: 'admin-1',
      email: 'root@innopeak.io',
      type: JwtTokenType.PLATFORM_ADMIN,
      iat: 1_700_000_000,
    };

    beforeEach(() => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.ACTIVE);
    });

    it('is refused once the user mark postdates the token, reading no tenant mark', async () => {
      sessionRevocationService.isRevoked.mockResolvedValue(true);

      await expect(target.validate(adminClaims)).rejects.toThrow(UnauthorizedException);

      expect(sessionRevocationService.isRevoked).toHaveBeenCalledWith({
        userId: 'admin-1',
        issuedAt: 1_700_000_000,
      });
    });

    it('is accepted when nothing has been marked', async () => {
      await expect(target.validate(adminClaims)).resolves.toMatchObject({ id: 'admin-1' });
    });

    it('is not looked up for a disabled admin, whose status already refuses it', async () => {
      platformAdminDbService.findStatusById.mockResolvedValue(PlatformAdminStatus.DISABLED);

      await expect(target.validate(adminClaims)).rejects.toThrow(UnauthorizedException);

      expect(sessionRevocationService.isRevoked).not.toHaveBeenCalled();
    });
  });

  // A disabled admin's still-valid JWT must stop working on the next request, not at token expiry.
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
