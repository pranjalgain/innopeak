import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse } from '@nestjs/swagger';

/** Excluded from Swagger: only Stripe calls this route, never a client. */
export function ApiStripeWebhook(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiExcludeEndpoint(),
    ApiOperation({
      summary: 'Stripe webhook receiver',
      description:
        "Public (no JWT) — Stripe's own signature (Stripe-Signature header, verified against " +
        'req.rawBody) is the trust boundary instead. Idempotent per Stripe event id.',
    }),
    ApiResponse({ status: HttpStatus.OK, description: 'Event processed (or a known duplicate)' }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'STRIPE_WEBHOOK_SIGNATURE_INVALID',
    })
  );
}
