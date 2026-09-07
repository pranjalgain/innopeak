import { MESSAGES } from '@common/constants/messages.constants';
import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

import { JwtTokenType } from '../enums/jwt-token-type.enum';
import type { AuthUser, TenantAuthUser } from '../types/auth-user.type';

/**
 * `@CurrentUser()` narrowed to a tenant user, for every route whose work is tenant-scoped.
 *
 * `AuthUser` is a discriminated union and a `platform_admin` token carries no `tenantId` at all,
 * so a handler that takes `@CurrentUser() user: AuthUser` and reaches for `user.tenantId` either
 * fails to compile or — worse, if someone casts — reads `undefined` and runs a query scoped to
 * nothing. On the connections routes that would mean writing a Google connection into no tenant,
 * or reading another one's. `@Roles('owner')` already fails a platform admin closed, but five of
 * these routes are plain `Bearer` with no role gate, so the check has to live here too.
 *
 * Throwing rather than returning `null` is the point: the return type is a non-optional
 * `TenantAuthUser`, which makes `tenantId: string` a fact the type system guarantees rather than
 * a line item on a review checklist.
 */
export const CurrentTenantUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantAuthUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthUser | undefined;

    if (!user || user.type !== JwtTokenType.TENANT_USER) {
      throw new ForbiddenException(MESSAGES.AUTH.TENANT_CONTEXT_REQUIRED);
    }

    return user;
  }
);
