import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';

import { RolesGuard } from './roles.guard';

import type { RoleRequirement } from '../decorators/roles.decorator';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { UserRole } from '../enums/user-role.enum';
import type { AuthUser } from '../types/auth.type';

function contextWithUser(user: AuthUser | undefined, requiredRoles?: RoleRequirement[]) {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
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
  it('allows any authenticated principal when no @Roles() is set', () => {
    const { guard, context } = contextWithUser(tenantOwner, undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a tenant user whose role matches one of the required roles', () => {
    const { guard, context } = contextWithUser(tenantOwner, [UserRole.OWNER]);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a tenant user whose role matches none of the required roles', () => {
    const { guard, context } = contextWithUser(tenantMember, [UserRole.OWNER]);
    expect(guard.canActivate(context)).toBe(false);
  });

  /**
   * The regression this guards against: widening `@Roles()` to also accept
   * `JwtTokenType.PLATFORM_ADMIN` must not weaken any *existing* tenant-role-only route. A route
   * whose @Roles() list is all UserRole values must keep rejecting a platform-admin token exactly
   * as it did before the widening.
   */
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
