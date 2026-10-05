/** How long a posting claim (`review_responses.post_attempted_at`) may sit with no terminal write
 *  before another attempt may reclaim it. Posting is one HTTP call, not a multi-page import, so 5
 *  minutes is generous headroom for a slow response. Shared by the repository's claim query and the
 *  queue service's "re-check after a DB failure" delay, which must outlast it. */
export const POST_CLAIM_STALE_MINUTES = 5;
