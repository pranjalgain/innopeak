/**
 * Super Admin view of a tenant's Google Business Profile connection. The two zero-connection cases
 * are kept apart because they mean opposite things in a cross-tenant triage list:
 *   - `never_connected`: signed up, never finished onboarding (sales follow-up).
 *   - `disconnected`: lost a working connection, so reviews stopped syncing (engineering).
 * Merging them buried real disconnections under new signups in the "Needs attention" panel.
 */
export enum BusinessConnectionStatus {
  CONNECTED = 'connected',
  NEEDS_REAUTH = 'needs_reauth',
  DISCONNECTED = 'disconnected',
  NEVER_CONNECTED = 'never_connected',
}
