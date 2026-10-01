import { MESSAGES } from '@common/constants/messages.constants';
import { ConflictException, NotFoundException } from '@nestjs/common';

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
