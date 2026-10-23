import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { RoleRequirement, ROLES_KEY } from '../decorators/roles.decorator';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { AuthUser } from '../types/auth.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    // `JwtAuthGuard` let a public route through without authenticating anyone; there is no principal to check.
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true) {
      return true;
    }

    // getAllAndOverride returns undefined at runtime when no metadata is set, though its type omits it.
    const requiredRoles = this.reflector.getAllAndOverride<RoleRequirement[] | undefined>(
      ROLES_KEY,
      targets
    );

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;

    // A route that is neither public nor lists a role is a tenant route: every platform-admin route declares
    // `@Roles(PLATFORM_ADMIN)` (a spec pins that), and the tenant services narrow the principal themselves. Defaulting to "any
    // authenticated principal" would let a route that forgot its check be reached by an admin token, and the reverse would let a tenant
    // user reach an admin route that forgot its `@Roles`; this closes the first and the spec the second.
    if (!requiredRoles || requiredRoles.length === 0) {
      return user?.type === JwtTokenType.TENANT_USER;
    }

    // Checked before the tenant branch: no existing @Roles() lists PLATFORM_ADMIN, so this cannot open a route
    // that wasn't already asking for it.
    if (
      requiredRoles.includes(JwtTokenType.PLATFORM_ADMIN) &&
      user?.type === JwtTokenType.PLATFORM_ADMIN
    ) {
      return true;
    }

    // Platform admins have no `role`; a route listing only UserRole values is tenant-only, so they fail closed here.
    if (user?.type !== JwtTokenType.TENANT_USER) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }
}
