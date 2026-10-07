import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { RoleRequirement, ROLES_KEY } from '../decorators/roles.decorator';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { AuthUser } from '../types/auth.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // getAllAndOverride returns undefined at runtime when no metadata is set, though its type omits it.
    const requiredRoles = this.reflector.getAllAndOverride<RoleRequirement[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;

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
