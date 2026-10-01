import { MESSAGES } from '@common/constants/messages.constants';

import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { TenantOnlyException } from '../exceptions/auth.exceptions';
import type { AuthUser, TenantAuthUser } from '../types/auth.type';

/**
 * Narrows `@CurrentUser()`'s `AuthUser` to a `TenantAuthUser`, for any handler whose work is
 * tenant-scoped.
 *
 * `AuthUser` is a discriminated union and a `platform_admin` token carries no `tenantId` at all,
 * so code that reaches for `user.tenantId` without narrowing first either fails to compile or —
 * worse, if someone casts — reads `undefined` and runs a query scoped to nothing. `@Roles()`
 * already fails a platform admin closed on routes that have it, but several tenant-scoped routes
 * are plain `Bearer` with no role gate, so this has to run there too.
 *
 * A plain function, not a second param decorator: there is one principal shape today
 * (`TenantAuthUser`) besides the platform admin, but an admin section will add more, and a
 * decorator per shape doesn't scale the way a narrowing call does. `@CurrentUser()` stays the
 * one param decorator for every route; narrowing to whichever principal a handler needs is an
 * ordinary function call.
 *
 * Throwing rather than returning `null` is the point: the return type is a non-optional
 * `TenantAuthUser`, which makes `tenantId: string` a fact the type system guarantees rather than
 * a line item on a review checklist.
 */
export function requireTenantUser(
  user: AuthUser,
  message: string = MESSAGES.AUTH.TENANT_CONTEXT_REQUIRED
): TenantAuthUser {
  if (user.type !== JwtTokenType.TENANT_USER) {
    throw new TenantOnlyException(message);
  }
  return user;
}
