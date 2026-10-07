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
 * Mirrors the v4 review resource's `reviewReply`, which the provider's freshness check reads before
 * posting. Returns `{ reviewReply: null }`, not a 404, when nothing is posted: a missing reply is a
 * normal state.
 */
gbpRouter.get(
  '/v4/accounts/:accountId/locations/:locationId/reviews/:reviewId',
  (req, res) => {
    const reply = getReply(req.params.reviewId) ?? null;
    res.json({ reviewId: req.params.reviewId, reviewReply: reply });
  }
);

/**
 * Honors a one-shot forced failure (`/gbp/__force-failure`) so a test can exercise `post_failed` +
 * `retry-post`.
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

/**
 * Debug-only: the only local way to reproduce the freshness-check abort-and-supersede path, which
 * depends on a reply our system never wrote.
 */
gbpRouter.post('/gbp/__seed-external-reply', (req: { body: SeedExternalReplyRequestBody }, res) => {
  const { reviewId, comment, updateTime } = req.body;
  if (!reviewId || !comment) {
    res.status(400).json({ error: { message: 'reviewId and comment are both required.' } });
    return;
  }
  setReply(reviewId, { comment, updateTime: updateTime ?? new Date().toISOString() });
  res.status(201).json({ reviewId, comment, updateTime: updateTime ?? new Date().toISOString() });
});

gbpRouter.post('/gbp/__force-failure', (_req, res) => {
  armNextReplyFailure();
  res.status(204).end();
});

gbpRouter.post('/gbp/__reset', (_req, res) => {
  reset();
  res.status(204).end();
});

gbpRouter.delete('/gbp/__reply/:reviewId', (req, res) => {
  deleteReply(req.params.reviewId);
  res.status(204).end();
});
