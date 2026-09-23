import { MESSAGES } from '@common/constants/messages.constants';
import { NotFoundException } from '@nestjs/common';

export class NotificationNotFoundException extends NotFoundException {
  constructor(message: string = MESSAGES.NOTIFICATIONS.NOT_FOUND) {
    super({ message, code: 'NOTIFICATION_NOT_FOUND' });
  }
}
