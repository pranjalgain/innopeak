/** Not a DB column: projected from `review_provider_connections.status` plus whether an active location exists, since `google_connection_status` has no `disconnected` value. */
export enum ConnectionState {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}
