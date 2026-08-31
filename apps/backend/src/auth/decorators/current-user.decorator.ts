import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from '../interfaces/auth-user.interface';

/**
 * Parameter decorator that extracts the authenticated user from the request.
 * Must be used on routes protected by JwtAuthGuard.
 *
 * @example
 * @Get('profile')
 * getProfile(@CurrentUser() user: AuthUser) {
 *   return user;
 * }
 *
 * @example
 * @Get('profile')
 * getEmail(@CurrentUser('email') email: string) {
 *   return email;
 * }
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthUser | undefined,
    ctx: ExecutionContext
  ): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser;

    if (data) {
      return user[data];
    }

    return user;
  }
);
