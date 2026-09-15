/**
 * The Super Admin area's simplified view of a tenant's standing — collapses the real
 * `tenant_status` enum's `pending_activation` into `active` (a tenant mid-onboarding is not
 * suspended, which is the only distinction this list actually needs to show). `suspend`/
 * `reactivate` still write the real 3-value `TenantStatus` underneath; this is a display-only
 * projection, not a replacement for it.
 */
export enum BusinessStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}
