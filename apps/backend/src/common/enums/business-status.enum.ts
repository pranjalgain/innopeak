/**
 * The Super Admin area's simplified view of a tenant's standing — collapses the real
 * `tenant_status` enum's `pending_activation` into `active` (a tenant mid-onboarding is not
 * suspended, which is the only distinction this list actually needs to show). `suspend`/
 * `reactivate` still write the real 4-value `TenantStatus` underneath; this is a display-only
 * projection, not a replacement for it. `erased` is display-only in a second sense too — it is
 * never settable via `setStatus`/`UpdateBusinessStatusDto`, only reachable through
 * `requestErasure`'s own grace-period flow followed by the nightly purge job.
 */
export enum BusinessStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ERASED = 'erased',
}
