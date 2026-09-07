/**
 * The flattened connect state `GET /v1/connections` reports. Not a DB column: it is a projection
 * over `review_provider_connections.status` *and* whether an active location exists, because
 * `google_connection_status` has no `disconnected` value of its own.
 */
export enum ConnectionState {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
}
