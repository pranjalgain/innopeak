import type { EnvConfig } from '@config/env.config';
import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import { JwtStrategy } from './jwt.strategy';

import { JwtTokenType } from '../enums/jwt-token-type.enum';

describe('JwtStrategy', () => {
  let target: JwtStrategy;

  beforeEach(() => {
    const configService = {
      get: jest.fn(() => 'access-secret'),
    } as unknown as ConfigService<EnvConfig>;
    target = new JwtStrategy(configService);
  });

  it('maps a tenant_user payload to a TenantAuthUser', () => {
    expect(
      target.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        role: 'owner',
        type: JwtTokenType.TENANT_USER,
      })
    ).toEqual({
      type: JwtTokenType.TENANT_USER,
      id: 'user-1',
      tenantId: 'tenant-1',
      email: 'jane@thecoffeehouse.com',
      role: 'owner',
    });
  });

  it('maps a platform_admin payload to a PlatformAdminAuthUser', () => {
    expect(
      target.validate({
        sub: 'admin-1',
        email: 'root@innopeak.io',
        type: JwtTokenType.PLATFORM_ADMIN,
      })
    ).toEqual({ type: JwtTokenType.PLATFORM_ADMIN, id: 'admin-1', email: 'root@innopeak.io' });
  });

  it('rejects a payload with no type claim instead of defaulting it to a tenant user', () => {
    expect(() =>
      target.validate({ sub: 'user-1', email: 'jane@thecoffeehouse.com', role: 'owner' })
    ).toThrow(UnauthorizedException);
  });

  it('rejects a refresh token presented as a bearer token', () => {
    expect(() =>
      target.validate({
        sub: 'user-1',
        email: 'jane@thecoffeehouse.com',
        type: JwtTokenType.REFRESH,
      })
    ).toThrow(UnauthorizedException);
  });

  it('rejects a tenant_user payload missing tenantId or carrying an unknown role', () => {
    expect(() =>
      target.validate({
        sub: 'user-1',
        email: 'jane@thecoffeehouse.com',
        role: 'owner',
        type: JwtTokenType.TENANT_USER,
      })
    ).toThrow(UnauthorizedException);

    expect(() =>
      target.validate({
        sub: 'user-1',
        tenantId: 'tenant-1',
        email: 'jane@thecoffeehouse.com',
        role: 'superuser',
        type: JwtTokenType.TENANT_USER,
      })
    ).toThrow(UnauthorizedException);
  });

  it('rejects a payload without a string sub/email', () => {
    expect(() => target.validate({ type: JwtTokenType.PLATFORM_ADMIN })).toThrow(
      UnauthorizedException
    );
  });
});
