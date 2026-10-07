/** Purely a label for the sync-run history view; `acquireSyncRun`'s concurrency handling is identical for both. */
export enum SyncTrigger {
  SCHEDULED = 'scheduled',
  BACKFILL = 'backfill',
}
