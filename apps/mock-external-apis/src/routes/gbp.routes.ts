import { Router } from 'express';

import {
  armNextReplyFailure,
  consumeForcedFailure,
  deleteReply,
  getReply,
  reset,
  setReply,
} from '../store/gbp-reply-store';

interface ReplyRequestBody {
  comment?: string;
}

interface SeedExternalReplyRequestBody {
  reviewId?: string;
  comment?: string;
  updateTime?: string;
}

export const gbpRouter = Router();

/**
 * Mirrors the legacy `mybusiness.googleapis.com/v4` review resource's `reviewReply` sub-field —
 * `GoogleBusinessProfileProvider.getReviewReply`'s freshness check reads this immediately before
 * posting. Returns `{ reviewReply: null }` (not a 404) when nothing has been posted yet, matching
 * a real review that has no reply — a missing reply is a normal state, not an error.
 */
gbpRouter.get(
  '/v4/accounts/:accountId/locations/:locationId/reviews/:reviewId',
  (req, res) => {
    const reply = getReply(req.params.reviewId) ?? null;
    res.json({ reviewId: req.params.reviewId, reviewReply: reply });
  }
);

/**
 * Mirrors `PUT .../reviews/{reviewId}/reply` — the actual post. Honors a one-shot forced failure
 * (`/gbp/__force-failure`) so a test can exercise `post_failed` + `retry-post` without the mock
 * server needing to stay broken afterward.
 */
gbpRouter.put(
  '/v4/accounts/:accountId/locations/:locationId/reviews/:reviewId/reply',
  (req: { params: { reviewId: string }; body: ReplyRequestBody }, res) => {
    if (consumeForcedFailure()) {
      res.status(500).json({ error: { message: 'Forced failure for local testing.' } });
      return;
    }

    const comment = req.body.comment ?? '';
    const reply = { comment, updateTime: new Date().toISOString() };
    setReply(req.params.reviewId, reply);
    res.json(reply);
  }
);

/** Debug-only: pre-seeds a review as "already replied to on Google" — the only way to locally
 *  reproduce the freshness-check abort-and-supersede path (PLAN.md §8.12) without a real GBP
 *  account, since that path depends on an external reply existing that our own system never
 *  wrote. */
gbpRouter.post('/gbp/__seed-external-reply', (req: { body: SeedExternalReplyRequestBody }, res) => {
  const { reviewId, comment, updateTime } = req.body;
  if (!reviewId || !comment) {
    res.status(400).json({ error: { message: 'reviewId and comment are both required.' } });
    return;
  }
  setReply(reviewId, { comment, updateTime: updateTime ?? new Date().toISOString() });
  res.status(201).json({ reviewId, comment, updateTime: updateTime ?? new Date().toISOString() });
});

/** Debug-only: arms the next `PUT .../reply` call to fail once. */
gbpRouter.post('/gbp/__force-failure', (_req, res) => {
  armNextReplyFailure();
  res.status(204).end();
});

/** Debug-only: clears every seeded/posted reply and any armed failure, for a clean slate between
 *  test runs without restarting the process. */
gbpRouter.post('/gbp/__reset', (_req, res) => {
  reset();
  res.status(204).end();
});

/** Debug-only: removes one review's reply state, for a narrower reset than `__reset`. */
gbpRouter.delete('/gbp/__reply/:reviewId', (req, res) => {
  deleteReply(req.params.reviewId);
  res.status(204).end();
});
