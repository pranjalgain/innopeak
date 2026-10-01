// ─── ReviewSyncQueueService ──────────────────────────────────────────────

export interface ImportOutcome {
  reviewsFetched: number;
  /** The max `external_updated_at` seen this run. `null` when nothing was fetched — `completeRun`
   *  treats that as "leave the location's cursor where it was," not "reset it." */
  maxExternalUpdatedAt: string | null;
}

export interface PollImportOutcome extends ImportOutcome {
  /**
   * The page cap was hit *before* reaching the location's cursor, meaning this run could not see
   * the whole backlog. Load-bearing, not informational — see `runPoll`, which fails the run on it.
   */
  truncated: boolean;
}

export interface ClassifyAndGenerateOutcome {
  classified: number;
  skipped: number;
  /** See `AiReplyGenerationService.generateForClassifiedReviews`'s own return shape — folded in
   *  here rather than kept as a separate outcome object, since both phases share one
   *  `sync_runs` row and one pair of log lines. */
  generated: number;
  generationFailed: number;
  quotaReached: boolean;
  error: string | null;
}
