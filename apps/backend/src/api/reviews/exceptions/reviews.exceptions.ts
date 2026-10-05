import { MESSAGES } from '@common/constants/messages.constants';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

export class ReviewNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.REVIEWS.REVIEW_NOT_FOUND) {
    super({ message, code: 'REVIEW_NOT_FOUND' });
  }
}

export class ReviewResponseNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.REVIEWS.RESPONSE_NOT_FOUND) {
    super({ message, code: 'REVIEW_RESPONSE_NOT_FOUND' });
  }
}

/** The response exists but isn't `pending_approval` — already decided, or raced away by a
 *  sibling's approval superseding it first. A 409, not a 404: the row is plainly still there. */
export class ReviewResponseNotApprovableException extends ConflictException {
  constructor(message: string = MESSAGES.REVIEWS.RESPONSE_NOT_ACTIONABLE) {
    super({ message, code: 'REVIEW_RESPONSE_NOT_ACTIONABLE' });
  }
}

/** `idx_review_responses_review_id_live_reply` — a sibling won the same race a moment earlier. */
export class ReviewResponseAlreadyLiveException extends ConflictException {
  constructor(message: string = MESSAGES.REVIEWS.RESPONSE_ALREADY_LIVE) {
    super({ message, code: 'REVIEW_RESPONSE_ALREADY_LIVE' });
  }
}

/** The response is not at `post_failed` — `retry-post`'s one legal source state. */
export class ResponseNotRetryableException extends ConflictException {
  constructor(message: string = MESSAGES.REVIEWS.RESPONSE_NOT_RETRYABLE) {
    super({ message, code: 'RESPONSE_NOT_RETRYABLE' });
  }
}

/** The response is not at `approved` — the manual `.../responses/:responseId/post` route's one
 *  legal source state. */
export class ResponseNotPostableException extends ConflictException {
  constructor(message: string = MESSAGES.REVIEWS.RESPONSE_NOT_POSTABLE) {
    super({ message, code: 'RESPONSE_NOT_POSTABLE' });
  }
}

/** `idx_review_responses_review_id_live_reply` unique violation on manual-reply/retry-post/
 *  manual-post — distinct code from `ReviewResponseAlreadyLiveException` (approve's own) per the
 *  documented API spec, since the two routes' client copy differs. */
export class ReviewAlreadyHasLiveReplyException extends ConflictException {
  constructor(message: string = MESSAGES.REVIEWS.REVIEW_ALREADY_HAS_LIVE_REPLY) {
    super({ message, code: 'REVIEW_ALREADY_HAS_LIVE_REPLY' });
  }
}

/** Manual reply attempted on a `reviews.status = 'dismissed'` review. */
export class ReviewAlreadyDismissedException extends ConflictException {
  constructor(message: string = MESSAGES.REVIEWS.REVIEW_ALREADY_DISMISSED) {
    super({ message, code: 'REVIEW_ALREADY_DISMISSED' });
  }
}

/** Manual reply attempted on a review whose `removed_upstream_at` is set. */
export class ReviewRemovedUpstreamException extends ConflictException {
  constructor(message: string = MESSAGES.REVIEWS.REVIEW_REMOVED_UPSTREAM) {
    super({ message, code: 'REVIEW_REMOVED_UPSTREAM' });
  }
}

/** The review-post queue (Redis/SQS) rejected the job — nothing was posted. A manual post leaves the
 *  response `approved` to try again; a failed retry puts it back at `post_failed`, so the retry
 *  control stays available either way. */
export class PostQueueUnavailableException extends ServiceUnavailableException {
  constructor(message: string = MESSAGES.REVIEWS.POST_QUEUE_UNAVAILABLE) {
    super({ message, code: 'POST_QUEUE_UNAVAILABLE' });
  }
}
