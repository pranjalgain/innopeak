/** `tenants.status`. `suspended` and `erased` both block login at the point checked in
 *  AuthService/TokenService. `erased` is terminal — reached only once every user in the tenant has
 *  been anonymized by the nightly erasure-purge cron job; there is no reactivation from it. */
export enum TenantStatus {
  PENDING_ACTIVATION = 'pending_activation',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ERASED = 'erased',
}
