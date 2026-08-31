import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthUser } from '../interfaces/auth-user.interface';

/**
 * Guard that enforces permission-based access control with AND logic.
 * The user needs ALL of the required permissions to pass.
 * If no permissions are specified on the route, access is granted.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Reflector.getAllAndOverride can genuinely return undefined at runtime when
    // no metadata is set on either the handler or the class, even though the
    // declared generic type does not include `undefined`.
    const requiredPermissions = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;

    if (!user || user.permissions.length === 0) {
      return false;
    }

    // AND logic: user needs all of the required permissions
    return requiredPermissions.every(permission => user.permissions.includes(permission));
  }
}
