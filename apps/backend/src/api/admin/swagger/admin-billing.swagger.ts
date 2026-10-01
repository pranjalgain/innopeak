import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';

import { AdminBillingSummaryResponseDto } from '../dto/admin-billing-summary-response.dto';
import { BillingWebhookEventListResponseDto } from '../dto/billing-webhook-event-response.dto';
import { HasPaidTenantsResponseDto } from '../dto/has-paid-tenants-response.dto';

export function ApiGetHasPaidTenants(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Whether any tenant is currently on the Paid plan',
      description:
        "A cheap existence check, not the full billing summary — backs the admin frontend's " +
        'Billing nav item / dashboard-route guard, which must stay available whenever at least ' +
        'one tenant is still on Paid, independent of PAYMENT_FEATURE_ENABLED (that flag only ' +
        "gates starting a new checkout, never an already-Paid tenant's subscription).",
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: HasPaidTenantsResponseDto,
      examples: {
        default: { summary: 'At least one Paid tenant', value: { hasPaidTenants: true } },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiGetBillingSummary(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Platform-wide billing statistics',
      description:
        'Plan split, subscription status breakdown, Free-to-Paid upgrade trend, and at-risk ' +
        '(past-due) subscriptions — the one place any of billing_plans/tenant_subscriptions ' +
        'gets an admin-facing read. Webhook activity is a separate, paginated endpoint — see ' +
        'ApiListBillingWebhookEvents.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AdminBillingSummaryResponseDto,
      examples: {
        default: {
          summary: 'Six-month billing summary',
          value: {
            freeCount: 121,
            paidCount: 7,
            activeCount: 6,
            pastDueCount: 1,
            canceledCount: 0,
            incompleteCount: 0,
            cancelingCount: 2,
            upgradeTrend: [
              { monthKey: '2026-04', count: 1 },
              { monthKey: '2026-05', count: 0 },
              { monthKey: '2026-06', count: 2 },
              { monthKey: '2026-07', count: 1 },
              { monthKey: '2026-08', count: 2 },
              { monthKey: '2026-09', count: 1 },
            ],
            atRisk: [
              {
                tenantId: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
                businessName: 'The Coastal Table',
                status: 'past_due',
                currentPeriodEnd: '2026-09-01T00:00:00.000Z',
              },
            ],
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.BAD_REQUEST, description: '`months` outside 1-24' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiListBillingWebhookEvents(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Paginated, filterable Stripe webhook activity',
      description:
        'The Stripe webhook deliveries (`stripe_webhook_events`) `BillingWebhooksService` ' +
        'actually acts on, newest first, resolved to the tenant its Stripe customer id belongs ' +
        'to where possible (null for an orphan delivery). Every other Stripe event type this app ' +
        'receives and ignores is out of scope for this endpoint entirely — a platform admin has ' +
        "no use for that raw traffic; debugging it is an engineering concern for Stripe's own " +
        'Dashboard event log or backend logs instead. `type` narrows to one exact handled event ' +
        "type, by StripeWebhookEventType's own key name rather than the raw Stripe wire string.",
    }),
    ApiQuery({ name: 'page', required: false, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, example: 20 }),
    ApiQuery({ name: 'type', required: false, example: 'CHECKOUT_SESSION_COMPLETED' }),
    ApiResponse({
      status: HttpStatus.OK,
      type: BillingWebhookEventListResponseDto,
      examples: {
        default: {
          summary: 'One page of webhook activity',
          value: {
            events: [
              {
                id: 'evt_1UJ8pAPZYAmQ4L9BbRlyLvwZ',
                type: 'checkout.session.completed',
                processedAt: '2026-09-24T09:27:54.169Z',
                tenantId: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
                businessName: 'The Coastal Table',
              },
              {
                id: 'evt_2VK9qBQaZBnR5M0CcSmzMwxA',
                type: 'invoice.payment_succeeded',
                processedAt: '2026-09-24T09:15:02.881Z',
                tenantId: null,
                businessName: null,
              },
            ],
            meta: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}
