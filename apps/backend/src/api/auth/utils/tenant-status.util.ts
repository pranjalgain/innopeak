import { TenantStatus } from '../enums/tenant-status.enum';

/** `suspended` and `erased` both block login/refresh — see `TenantStatus`'s own doc comment for
 *  why. Takes the tenant status row itself (rather than a bare `TenantStatus`) since every call
 *  site has it as `tenant?.status` off an optional lookup, not a guaranteed value. */
export function isTenantLoginBlocked(tenant: { status: TenantStatus } | null | undefined): boolean {
  return tenant?.status === TenantStatus.SUSPENDED || tenant?.status === TenantStatus.ERASED;
}
