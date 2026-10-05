/**
 * In-memory, process-lifetime store of "what's currently posted as the reply to this review" —
 * stateful on purpose, unlike the Azure mock below, because the whole point of building the real
 * GBP write path against this server is to exercise the freshness-check-then-post round trip
 * end-to-end: a PUT here must be visible to a later GET for the same review id, exactly like the
 * real Google API, so `ReviewPostQueueService`'s "read current state, abort if someone already
 * replied externally" logic has something real to read.
 *
 * Resets on process restart — acceptable for a dev-only emulator, and `reset()` below gives tests
 * an explicit way to clear it between runs without restarting the process.
 */

export interface GbpReply {
  comment: string;
  updateTime: string;
}

const replies = new Map<string, GbpReply>();

/** One-shot failure injection for `PUT .../reply` — set via `/gbp/__force-failure`, consumed (and
 *  cleared) by the very next reply attempt, so a test can force exactly one `post_failed` without
 *  the mock server staying broken afterward. */
let forceNextReplyFailure = false;

export function getReply(reviewId: string): GbpReply | undefined {
  return replies.get(reviewId);
}

export function setReply(reviewId: string, reply: GbpReply): void {
  replies.set(reviewId, reply);
}

export function deleteReply(reviewId: string): void {
  replies.delete(reviewId);
}

export function reset(): void {
  replies.clear();
  forceNextReplyFailure = false;
}

export function armNextReplyFailure(): void {
  forceNextReplyFailure = true;
}

/** Consumes the armed failure, if any — returns whether THIS call should fail. */
export function consumeForcedFailure(): boolean {
  if (!forceNextReplyFailure) {
    return false;
  }
  forceNextReplyFailure = false;
  return true;
}
