import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { RoleRequirement } from '../decorators/roles.decorator';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { UserRole } from '../enums/user-role.enum';
import type { AuthUser } from '../types/auth.type';

function contextWithUser(
  user: AuthUser | undefined,
  requiredRoles?: RoleRequirement[],
  options: { isPublic?: boolean } = {}
) {
  const reflector = {
    // Answers by key: the guard asks for `@Public()` as well as `@Roles()`.
    getAllAndOverride: jest.fn((key: string): unknown => {
      if (key === IS_PUBLIC_KEY) {
        return options.isPublic;
      }
      return requiredRoles;
    }),
  } as unknown as Reflector;

  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;

  return { guard: new RolesGuard(reflector), context };
}

const tenantOwner: AuthUser = {
  type: JwtTokenType.TENANT_USER,
  id: 'user-1',
  tenantId: 'tenant-1',
  email: 'owner@example.com',
  role: UserRole.OWNER,
  locale: null,
};

const tenantMember: AuthUser = { ...tenantOwner, role: UserRole.MEMBER };

const platformAdmin: AuthUser = {
  type: JwtTokenType.PLATFORM_ADMIN,
  id: 'admin-1',
  email: 'admin@innopeak.com',
  locale: null,
};

describe('RolesGuard', () => {
  // With no @Roles() a route is a tenant route: the tenant services narrow the principal themselves, and every admin route lists
  // PLATFORM_ADMIN. The default used to be "any authenticated principal", so a route that forgot its check was open to an admin token.
  describe('a route with no @Roles()', () => {
    it('allows a tenant user, owner or member', () => {
      for (const user of [tenantOwner, tenantMember]) {
        const { guard, context } = contextWithUser(user, undefined);
        expect(guard.canActivate(context)).toBe(true);
      }
    });

    it('refuses a platform-admin token', () => {
      const { guard, context } = contextWithUser(platformAdmin, undefined);
      expect(guard.canActivate(context)).toBe(false);
    });

    it('refuses a request with no principal at all', () => {
      const { guard, context } = contextWithUser(undefined, undefined);
      expect(guard.canActivate(context)).toBe(false);
    });

    it('treats an empty @Roles() the same way', () => {
      const { guard, context } = contextWithUser(platformAdmin, []);
      expect(guard.canActivate(context)).toBe(false);
    });
  });

  describe('a @Public() route', () => {
    it('lets a request through with no principal, with or without a @Roles()', () => {
      for (const roles of [undefined, [UserRole.OWNER]]) {
        const { guard, context } = contextWithUser(undefined, roles, { isPublic: true });
        expect(guard.canActivate(context)).toBe(true);
      }
    });
  });

  it('allows a tenant user whose role matches one of the required roles', () => {
    const { guard, context } = contextWithUser(tenantOwner, [UserRole.OWNER]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a tenant user whose role matches none of the required roles', () => {
    const { guard, context } = contextWithUser(tenantMember, [UserRole.OWNER]);
    expect(guard.canActivate(context)).toBe(false);
  });

  /** Widening @Roles() to accept PLATFORM_ADMIN must not let a platform-admin token through tenant-role-only routes. */
  it('rejects a platform-admin token on a route that only lists UserRole values', () => {
    const { guard, context } = contextWithUser(platformAdmin, [UserRole.OWNER, UserRole.MEMBER]);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('allows a platform-admin token on a route that lists JwtTokenType.PLATFORM_ADMIN', () => {
    const { guard, context } = contextWithUser(platformAdmin, [JwtTokenType.PLATFORM_ADMIN]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a tenant user on a route that only lists JwtTokenType.PLATFORM_ADMIN', () => {
    const { guard, context } = contextWithUser(tenantOwner, [JwtTokenType.PLATFORM_ADMIN]);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('rejects when there is no authenticated user at all', () => {
    const { guard, context } = contextWithUser(undefined, [UserRole.OWNER]);
    expect(guard.canActivate(context)).toBe(false);
  });

  it('rejects an unauthenticated request even for a platform-admin-only route', () => {
    const { guard, context } = contextWithUser(undefined, [JwtTokenType.PLATFORM_ADMIN]);
    expect(guard.canActivate(context)).toBe(false);
  });
});
