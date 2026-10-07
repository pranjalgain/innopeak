/** How long a posting claim may sit with no terminal write before another attempt may reclaim it; the queue service's re-check delay after a DB failure must outlast it. */
export const POST_CLAIM_STALE_MINUTES = 5;
