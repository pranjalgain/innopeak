/**
 * In-memory store of the reply currently posted per review. Stateful on purpose: a PUT must be
 * visible to a later GET for the same review id, like the real Google API, so
 * `ReviewPostQueueService`'s read-current-state-then-abort-if-replied logic has something real to
 * read. Resets on restart; `reset()` clears it between test runs.
 */

export interface GbpReply {
  comment: string;
  updateTime: string;
}

const replies = new Map<string, GbpReply>();

/**
 * One-shot failure injection for `PUT .../reply`, set via `/gbp/__force-failure` and cleared by the
 * next reply attempt so a test forces exactly one `post_failed`.
 */
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

/** Returns whether THIS call should fail. */
export function consumeForcedFailure(): boolean {
  if (!forceNextReplyFailure) {
    return false;
  }
  forceNextReplyFailure = false;
  return true;
}
