import { NotificationChannelPref } from '@common/enums/notification-channel-pref.enum';
import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

import {
  NotificationRecipientDto,
  NotificationRecipientListResponseDto,
} from '../dto/notification-recipient-response.dto';
import { UpdateNotificationRecipientDto } from '../dto/update-notification-recipient.dto';

export function ApiListNotificationRecipients(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List escalation notification recipients',
      description:
        'Owner-only. Every `notification_recipients` row for this tenant, joined to `users` for ' +
        'name/initials. Seeded with exactly one row (the signing-up owner) at signup — there is ' +
        'no add-recipient route yet, matching the shipped Settings UI, which only edits existing ' +
        'rows.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: NotificationRecipientListResponseDto,
      examples: {
        default: {
          summary: 'Typical response',
          value: {
            items: [
              {
                id: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8',
                userId: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d9',
                name: 'Maria Delgado',
                initials: 'MD',
                channel: NotificationChannelPref.EMAIL,
                isActive: true,
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' })
  );
}

export function ApiUpdateNotificationRecipient(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Update a notification recipient',
      description:
        'Changes `channel` and/or `isActive` for one recipient. Both fields optional, but at ' +
        'least one is required — matches the Settings UI’s channel toggle and active switch, ' +
        'which fire independently. `userId` is never editable here: repointing a recipient row ' +
        'at a different user is a remove-and-re-add, not an update.',
    }),
    ApiParam({ name: 'recipientId', type: String, format: 'uuid' }),
    ApiBody({
      type: UpdateNotificationRecipientDto,
      examples: { default: { value: { channel: NotificationChannelPref.BOTH } } },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: NotificationRecipientDto,
      examples: {
        default: {
          summary: 'Updated',
          value: {
            id: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8',
            userId: '0190f3c1-0a12-7b40-9e63-11c4a7f0b2d9',
            name: 'Maria Delgado',
            initials: 'MD',
            channel: NotificationChannelPref.BOTH,
            isActive: true,
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Neither field was provided' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'Recipient not found for this tenant',
    })
  );
}
