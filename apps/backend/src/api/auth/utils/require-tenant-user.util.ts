import { MESSAGES } from '@common/constants/messages.constants';

import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { TenantOnlyException } from '../exceptions/auth.exceptions';
import type { AuthUser, TenantAuthUser } from '../types/auth.type';

/**
 * A `platform_admin` token has no `tenantId`, and some tenant-scoped routes have no `@Roles` gate,
 * so narrow here (throwing) rather than read `undefined` and query scoped to nothing. A plain
 * function, not a second param decorator.
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
