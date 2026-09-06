import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { AuthUser } from '../types/auth-user.type';

/**
 * Guard that enforces role-based access control with OR logic.
 * The user needs at least ONE of the required roles to pass.
 * If no roles are specified on the route, access is granted.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Reflector.getAllAndOverride can genuinely return undefined at runtime when
    // no metadata is set on either the handler or the class, even though the
    // declared generic type does not include `undefined`.
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;

    // Platform admins have no `role` at all (flat hierarchy, see AuthUser) — any route gated by
    // @Roles(...) is a tenant-user-only route by definition, so a platform-admin token fails
    // closed here rather than needing every call site to remember the check.
    if (!user || user.type !== JwtTokenType.TENANT_USER) {
      return false;
    }

    // OR logic: user needs at least one of the required roles
    return requiredRoles.includes(user.role);
  }
}
