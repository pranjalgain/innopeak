import { MESSAGES } from '@common/constants/messages.constants';
import { NotFoundException } from '@nestjs/common';

export class ReviewNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.REVIEWS.REVIEW_NOT_FOUND) {
    super({ message, code: 'REVIEW_NOT_FOUND' });
  }
}
