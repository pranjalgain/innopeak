/** `sync_runs.trigger` — distinguishes the one-time historical backfill from the (not yet built)
 * 15-minute scheduled poll. Never branched on in the concurrency mechanics themselves — purely a
 * label for the sync-run history view. */
export enum SyncTrigger {
  SCHEDULED = 'scheduled',
  BACKFILL = 'backfill',
}
