/**
 * The Super Admin area's 4-state view of a tenant's Google Business Profile connection.
 *
 * `needs_reauth` mirrors `google_connection_status` directly. The other three split what
 * `ConnectionsService` (which only ever describes a single signed-in tenant's own connection)
 * collapses, because this view is a cross-tenant triage list and the two zero-connection cases
 * mean opposite things:
 *
 *   - `never_connected` — signed up, never finished onboarding. Expected for a new tenant; needs
 *     sales/onboarding follow-up, not engineering.
 *   - `disconnected` — had a working connection and lost it. Reviews have stopped syncing for a
 *     paying customer.
 *
 * Reporting both as `disconnected` made the Overview's "Needs attention" panel useless in
 * practice: it takes the three most recent non-connected tenants, and the newest signups are
 * almost always tenants that never onboarded, so a genuine mid-life disconnection never surfaced.
 */
export enum BusinessConnectionStatus {
  CONNECTED = 'connected',
  NEEDS_REAUTH = 'needs_reauth',
  DISCONNECTED = 'disconnected',
  NEVER_CONNECTED = 'never_connected',
}
