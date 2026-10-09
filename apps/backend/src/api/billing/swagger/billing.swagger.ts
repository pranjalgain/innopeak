import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiProduces, ApiResponse } from '@nestjs/swagger';

import { BillingProfileResponseDto } from '../dto/billing-profile-response.dto';
import { BillingPlansResponseDto } from '../dto/plan-response.dto';
import { ReceiptListResponseDto } from '../dto/receipt-response.dto';
import { ReconcileCheckoutSessionDto } from '../dto/reconcile-checkout-session.dto';
import { RedirectUrlResponseDto } from '../dto/redirect-url-response.dto';
import { SetActiveLocationDto } from '../dto/set-active-location.dto';
import { SetDefaultPaymentMethodDto } from '../dto/set-default-payment-method.dto';
import { SetupIntentResponseDto } from '../dto/setup-intent-response.dto';
import { SubscriptionResponseDto } from '../dto/subscription-response.dto';
import { UpdateBillingProfileDto } from '../dto/update-billing-profile.dto';

const PLAN_ID_EXAMPLE = '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011';

const PLANS_EXAMPLE = {
  plans: [
    {
      id: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0001',
      code: 'free',
      maxLocations: 1,
      maxAiDraftsPerMonth: 20,
      maxTeamMembers: 1,
      customPromptsEnabled: false,
    },
    {
      id: PLAN_ID_EXAMPLE,
      code: 'paid',
      maxLocations: null,
      maxAiDraftsPerMonth: null,
      maxTeamMembers: null,
      customPromptsEnabled: true,
    },
  ],
  currentPlanId: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0001',
};

const SUBSCRIPTION_EXAMPLE = {
  planCode: 'free',
  status: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  activeLocationCount: 1,
  maxLocations: 1,
  teamMemberCount: 1,
  maxTeamMembers: 1,
  aiDraftsUsedThisMonth: 0,
  maxAiDraftsPerMonth: 20,
  customPromptsEnabled: false,
  paymentMethod: null,
};

export function ApiListBillingPlans(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'List billing plans',
      description: "Returns both plans (Free/Paid) plus the caller tenant's current plan id.",
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Billing plans',
      type: BillingPlansResponseDto,
      examples: { default: { summary: 'Free + Paid, current plan is Free', value: PLANS_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' })
  );
}

export function ApiGetSubscription(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Get the caller tenant's subscription",
      description:
        'Current plan, Stripe subscription state (if any), and live entitlement usage against the plan.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Subscription',
      type: SubscriptionResponseDto,
      examples: { default: { summary: 'Free tenant, one location', value: SUBSCRIPTION_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' })
  );
}

export function ApiCreateCheckoutSession(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Create a Checkout session to upgrade to Paid',
      description:
        'Creates (or reuses) a payment-provider customer for this tenant and starts a subscription ' +
        'Checkout session. Gated on PAYMENT_FEATURE_ENABLED — see BILLING_NOT_ENABLED.',
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Checkout session created',
      type: RedirectUrlResponseDto,
      examples: {
        default: {
          summary: 'Checkout redirect URL',
          value: { url: 'https://checkout.stripe.com/c/pay/cs_test_...' },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'BILLING_NOT_ENABLED — the platform is not currently offering upgrades',
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'PLAN_NOT_FOUND / SUBSCRIPTION_NOT_FOUND',
    })
  );
}

export function ApiReconcileCheckoutSession(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Reconcile billing status against a Checkout session',
      description:
        'Reads the given Checkout Session straight from Stripe and applies it if it has a ' +
        "subscription on it yet — recovers the tenant's billing status even if " +
        'checkout.session.completed was delayed or never arrived. Call this once when the browser ' +
        'lands back on the success page with the session_id Stripe appended to success_url. Safe ' +
        'to call more than once, and safe to call even after the webhook already landed.',
    }),
    ApiBody({
      type: ReconcileCheckoutSessionDto,
      examples: {
        default: { value: { checkoutSessionId: 'cs_test_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6' } },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Subscription, refreshed against Stripe',
      type: SubscriptionResponseDto,
      examples: {
        default: { summary: 'Now paid', value: { ...SUBSCRIPTION_EXAMPLE, planCode: 'paid' } },
      },
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'CHECKOUT_SESSION_TENANT_MISMATCH / SUBSCRIPTION_NOT_FOUND',
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'PAYMENT_NOT_CONFIGURED — Stripe keys are not set',
    })
  );
}

export function ApiCreatePortalSession(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Create a Customer Portal session to manage/cancel billing',
      description:
        'Not gated on PAYMENT_FEATURE_ENABLED — an already-Paid tenant keeps full access to manage ' +
        'or cancel their subscription regardless of the deploy-level switch.',
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'Portal session created',
      type: RedirectUrlResponseDto,
      examples: {
        default: {
          summary: 'Portal redirect URL',
          value: { url: 'https://billing.stripe.com/p/session/...' },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'SUBSCRIPTION_NOT_FOUND — no Stripe customer exists for this tenant yet',
    })
  );
}

export function ApiSetActiveLocation(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Choose which connected location stays active under the current plan cap',
      description:
        'Only meaningful when the tenant has more connected locations than their plan allows — ' +
        'atomically pauses every other location and unpauses the chosen one.',
    }),
    ApiBody({
      type: SetActiveLocationDto,
      examples: {
        default: { value: { locationId: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0033' } },
      },
    }),
    ApiResponse({ status: HttpStatus.OK, description: 'Active location updated' }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description:
        "LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION — not this tenant's location, or disconnected",
    })
  );
}

export function ApiCancelSubscription(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Cancel the caller tenant's subscription at the end of the current period",
      description:
        'In-app cancellation — no redirect to a hosted portal. Calls the active payment provider ' +
        'directly; the plan stays Paid with ' +
        'full entitlements until the current billing period actually ends, matching what a real ' +
        'Stripe Customer Portal cancellation would leave the subscription in. Not gated on ' +
        'PAYMENT_FEATURE_ENABLED — an already-Paid tenant always keeps the ability to cancel.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Cancellation scheduled — cancelAtPeriodEnd is now true on the subscription',
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'SUBSCRIPTION_NOT_FOUND — no active Stripe subscription to cancel',
    })
  );
}

const RECEIPTS_EXAMPLE = {
  receipts: [
    {
      id: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0099',
      amountPaid: 4900,
      currency: 'usd',
      invoiceNumber: '8E8B7F1-0001',
      paidAt: '2026-09-01T12:00:00.000Z',
    },
  ],
};

export function ApiListReceipts(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "List the caller tenant's payment receipts",
      description:
        'One row per successfully paid Stripe invoice — empty for a tenant who has never made a ' +
        'real payment. See 0012_billing_receipts.sql.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Receipts, most recent first',
      type: ReceiptListResponseDto,
      examples: { default: { summary: 'One past payment', value: RECEIPTS_EXAMPLE } },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' })
  );
}

export function ApiDownloadReceiptPdf(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiProduces('application/pdf'),
    ApiOperation({
      summary: 'Download a PDF receipt for one past payment',
      description:
        'Rendered on demand, not stored — the PDF is generated fresh from the billing_receipts ' +
        "row each call. Scoped to the caller's own tenant; a receipt id that doesn't exist or " +
        'belongs to a different tenant both 404 as RECEIPT_NOT_FOUND.',
    }),
    ApiResponse({ status: HttpStatus.OK, description: 'application/pdf binary body' }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a tenant owner' }),
    ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'RECEIPT_NOT_FOUND' })
  );
}

const BILLING_PROFILE_EXAMPLE = { name: 'Jordan Lee', email: 'jordan@example.com' };

const TENANT_OWNER_RESPONSES = [
  ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
  ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Not a tenant owner',
  }),
  ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'SUBSCRIPTION_NOT_FOUND — no Stripe customer exists for this tenant yet',
  }),
] as const;

export function ApiGetBillingProfile(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Get the caller tenant's Stripe billing profile",
      description:
        'Reads name/email directly off the Stripe Customer object — in-app replacement for the ' +
        'hosted Customer Portal. Stripe-only.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Billing profile',
      type: BillingProfileResponseDto,
      examples: { default: { summary: 'Billing profile', value: BILLING_PROFILE_EXAMPLE } },
    }),
    ...TENANT_OWNER_RESPONSES
  );
}

export function ApiUpdateBillingProfile(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: "Update the caller tenant's Stripe billing profile",
      description: 'Writes name/email directly onto the Stripe Customer object. Stripe-only.',
    }),
    ApiBody({
      type: UpdateBillingProfileDto,
      examples: { default: { value: BILLING_PROFILE_EXAMPLE } },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Billing profile updated',
      type: BillingProfileResponseDto,
      examples: { default: { summary: 'Billing profile', value: BILLING_PROFILE_EXAMPLE } },
    }),
    ...TENANT_OWNER_RESPONSES
  );
}

export function ApiCreateSetupIntent(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Start adding/replacing the card on file',
      description:
        'Creates a Stripe SetupIntent and returns its client secret for Stripe Elements to confirm ' +
        'in the browser — the raw card never reaches this backend. Stripe-only. Confirming the ' +
        'SetupIntent client-side does not itself make the new card the default; call ' +
        'PUT /v1/billing/payment-method afterward with the resulting payment method id.',
    }),
    ApiResponse({
      status: HttpStatus.CREATED,
      description: 'SetupIntent created',
      type: SetupIntentResponseDto,
      examples: {
        default: {
          summary: 'SetupIntent client secret',
          value: { clientSecret: 'seti_1P0a2bC3dE4fG5h_secret_ABC123' },
        },
      },
    }),
    ...TENANT_OWNER_RESPONSES
  );
}

export function ApiSetDefaultPaymentMethod(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Make a just-confirmed SetupIntent payment method the default card',
      description:
        'Call this right after Stripe.js confirms the SetupIntent from ' +
        'POST /v1/billing/setup-intent, passing the payment method id it returned. Stripe-only.',
    }),
    ApiBody({
      type: SetDefaultPaymentMethodDto,
      examples: { default: { value: { paymentMethodId: 'pm_1P0a2bC3dE4fG5h' } } },
    }),
    ApiResponse({ status: HttpStatus.OK, description: 'Payment method updated' }),
    ...TENANT_OWNER_RESPONSES
  );
}
