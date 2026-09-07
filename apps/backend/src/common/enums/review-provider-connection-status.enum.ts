/** `review_provider_connections.status` (DB enum `google_connection_status`) — credential health
 * only. Owner intent ("I disconnected on purpose") lives on `disconnected_at`, not here. */
export enum ReviewProviderConnectionStatus {
  ACTIVE = 'active',
  NEEDS_REAUTH = 'needs_reauth',
}
