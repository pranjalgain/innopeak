// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface MetricsDto {
  /**
   * Reviews whose `reviewed_at` falls inside the requested window.
   */
  total: number;
  /**
   * Mean rating across the window, or null when it contains no reviews.
   */
  avgRating?: number | null;
  /**
   * Open queue backlog (status `new` or `in_review`). Deliberately NOT windowed: the card reads \"Pending approval\", so it has to count everything still awaiting action, not just what arrived in the last `days`.
   */
  pending: number;
  /**
   * Escalated reviews still open — classification `escalated` AND status `new`/`in_review`. Not windowed, same reasoning as `pending`. The status filter is what lets this fall back to zero as the queue is worked; counting every escalation ever would only ever grow.
   */
  escalated: number;
  /**
   * Review counts keyed by rating, for the same trailing `days` window as `total`/`avgRating`. Keys 1-5 are always present and zero-filled, so the client can render five bars without probing for absent buckets.
   */
  ratingDistribution: { [key: string]: number };
}
