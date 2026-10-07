import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse } from '@nestjs/swagger';

export function ApiExportTenantData(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiProduces('application/json'),
    ApiOperation({
      summary: "Download a copy of the business's data (owner only)",
      description:
        'One JSON file — team, settings, blocklist, notification recipients, locations, prompts, ' +
        'reviews with every reply, and billing receipts. Streamed, so a large review history does ' +
        'not load into memory. Credentials, tokens, Stripe ids and internal machinery are never ' +
        'included. The body is the file, not the usual response envelope. Not available for a ' +
        'suspended business (including one with an erasure pending).',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'The export, as an attachment.',
      content: {
        'application/json': {
          example: {
            format: 'innopeak-export',
            version: 1,
            exportedAt: '2026-10-07T09:30:00.000Z',
            business: {
              name: 'Acme Dental',
              status: 'active',
              createdAt: '2026-03-02T10:00:00.000Z',
            },
            team: [],
            settings: {
              escalationRatingThreshold: 3,
              autoPostEnabled: false,
              reviewDataRetentionMonths: null,
              aiReplyCount: 1,
            },
            blocklist: [],
            notificationRecipients: [],
            locations: [],
            prompts: [],
            reviews: [],
            billing: { plan: 'free', status: null, currentPeriodEnd: null, receipts: [] },
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'Not an owner, or the business is suspended.',
    }),
    ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Throttled (3 per minute).' })
  );
}
