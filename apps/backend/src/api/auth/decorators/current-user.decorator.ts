import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthUser } from '../types/auth.type';

/** Requires a route protected by `JwtAuthGuard`. */
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
