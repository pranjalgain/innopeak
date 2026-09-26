import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiResponse } from '@nestjs/swagger';

/**
 * `@ApiExcludeEndpoint()` — this route is never called by a browser/API client, only by Stripe
 * itself, so it has no place in the interactive Swagger UI a human explores. Still one composed
 * decorator per route per this repo's convention, not inline decorators on the controller method.
 */
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
