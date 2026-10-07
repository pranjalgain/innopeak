/**
 * Display-only projection of `TenantStatus` for the Super Admin list: `pending_activation` collapses
 * into `active`. `erased` is never settable via `setStatus`; it is only reached through the
 * erasure grace-period flow and the nightly purge.
 */
export enum BusinessStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ERASED = 'erased',
}
