import { TenantStatus } from '../enums/tenant-status.enum';

/**
 * `suspended` and `erased` both block login/refresh. Takes the status row because call sites hold
 * `tenant?.status` off an optional lookup.
 */
export function isTenantLoginBlocked(tenant: { status: TenantStatus } | null | undefined): boolean {
  return tenant?.status === TenantStatus.SUSPENDED || tenant?.status === TenantStatus.ERASED;
}
