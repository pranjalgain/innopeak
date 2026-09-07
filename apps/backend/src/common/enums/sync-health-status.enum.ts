/** `locations.last_sync_status` — the rolled-up outcome of the most recent poll attempt. Has no
 * `running` value by design; that's `sync_runs.status`'s job. */
export enum SyncHealthStatus {
  OK = 'ok',
  ERROR = 'error',
}
