/** `sync_runs.trigger` — distinguishes the one-time historical backfill from the 15-minute
 * scheduled poll (`ReviewSyncQueueService.runBackfill` / `runPoll`). Never branched on in the
 * concurrency mechanics themselves (`acquireSyncRun`'s CAS-and-reclaim is identical either way) —
 * purely a label for the sync-run history view. */
export enum SyncTrigger {
  SCHEDULED = 'scheduled',
  BACKFILL = 'backfill',
}
