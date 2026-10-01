// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

// May contain unused imports in some cases
// @ts-ignore
import type { BillingWebhookEventResponseDto } from './billing-webhook-event-response-dto';
// May contain unused imports in some cases
// @ts-ignore
import type { PaginationMetaDto } from './pagination-meta-dto';

export interface BillingWebhookEventListResponseDto {
  /**
   * Newest first.
   */
  events: Array<BillingWebhookEventResponseDto>;
  meta: PaginationMetaDto;
}
