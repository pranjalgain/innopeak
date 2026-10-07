/** `tenants.status`. `suspended` and `erased` both block login. `erased` is terminal: no reactivation. */
export enum TenantStatus {
  PENDING_ACTIVATION = 'pending_activation',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ERASED = 'erased',
}
