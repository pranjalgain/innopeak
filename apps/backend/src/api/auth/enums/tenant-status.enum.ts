/** `tenants.status`. `suspended` blocks login at the point checked in AuthService/TokenService. */
export enum TenantStatus {
  PENDING_ACTIVATION = 'pending_activation',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}
