---
sidebar_position: 2
---

# Billing Module — API Reference

## How to read this document

This describes the billing module **as it is actually implemented** —
`src/api/billing/controllers/billing.controller.ts` and `billing-webhooks.controller.ts`,
`src/api/billing/services/billing.service.ts`, the `dto/` classes it returns, and
`src/api/billing/exceptions/billing.exceptions.ts`. Like [Admin Overview](../admin-overview/api-reference.md),
nothing here is a pre-implementation target design — every route, field, and default below is read
straight off shipped code.

It assumes you have read [Billing Module — Overview](./overview.md) for the reasoning behind the
Free/Paid entitlement split, the deploy-level `PAYMENT_FEATURE_ENABLED` switch, the payment
provider, and the webhook state machine. Those narratives are not repeated here — this document
turns them into request/response contracts.

## Conventions

- **Base path**: `/v1/billing/...` — `RouteNames.BILLING` (`'billing'`), `version: '1'` on both
  controllers. `BillingController` and `BillingWebhooksController` share this same prefix (two
  controllers, one module).
- **Auth column**: `Bearer, owner-only` for every route on `BillingController` —
  `@Roles(UserRole.OWNER)` at the controller level, same reasoning as `PromptsController`: billing
  plans/upgrades are a business-level decision, not something any team member should trigger. The
  one exception is `POST /v1/billing/webhooks/stripe`, which is `@Public()` — see
  [§ Stripe webhook](#post-v1billingwebhooksstripe) below for its own trust model.
- **Throttle**: no route in `BillingController` carries a `@Throttle()` override, so every route
  falls back to the global `short` tier — 30 requests/minute (`ThrottlerModule.forRoot`,
  `app.module.ts`), shared with every other unthrottled route in the app. The webhook controller
  is the exception: it is skipped by **every** tier (`@SkipThrottle(SKIP_ALL_THROTTLERS)`). A bare
  `@SkipThrottle()` only skips a tier named `default`, which this app does not register, so it
  skipped nothing and a burst of Stripe retries after an outage was answered `429` — which Stripe
  counts as a failed delivery. Health and metrics use the same constant.
- **Envelopes**: success payloads shown below are the *inner* `data` — `TransformInterceptor` wraps
  every 2xx as `{ statusCode, status, message, data }`. Every non-2xx is
  `{ statusCode, status, message, error, traceId, data: null }` via `HttpExceptionFilter` +
  `ErrorHandlerService`. See the auth reference's [Conventions](../auth/api-reference.md#conventions)
  for the full version with worked envelope examples.
- **Timestamps** are ISO 8601 UTC strings. **Ids** are `uuidv7()` values, except Stripe's own
  ids (`cus_...`, `sub_...`, `evt_...`, `cs_...`), which are opaque strings from the payment provider.

## Plans & subscription

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/billing/plans` | Bearer, owner-only | global `short` tier (30/min) |
| `GET` | `/v1/billing/subscription` | Bearer, owner-only | global `short` tier (30/min) |

### `GET /v1/billing/plans`

Both plans (Free and Paid), plus the caller tenant's current plan id. No query params.

Success `200`:

```json
{
  "plans": [
    {
      "id": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0001",
      "code": "free",
      "maxLocations": 1,
      "maxAiDraftsPerMonth": 20,
      "maxTeamMembers": 1,
      "customPromptsEnabled": false
    },
    {
      "id": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0011",
      "code": "paid",
      "maxLocations": null,
      "maxAiDraftsPerMonth": null,
      "maxTeamMembers": null,
      "customPromptsEnabled": true
    }
  ],
  "currentPlanId": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0001"
}
```

| Field | Type | Rules |
|---|---|---|
| `plans[].id` | string (uuid) | `billing_plans.id` |
| `plans[].code` | enum | `free` \| `paid` (`billing_plan_code`) |
| `plans[].maxLocations` / `maxAiDraftsPerMonth` / `maxTeamMembers` | integer \| null | `null` = unlimited |
| `plans[].customPromptsEnabled` | boolean | Flat feature lock, not a usage cap — see [Overview § Free vs Paid](./overview.md#free-vs-paid-a-hybrid-usage-cap--feature-lock-split) |
| `currentPlanId` | string (uuid) | The caller tenant's `tenant_subscriptions.plan_id` |

Errors: `401`, `403` (not a tenant owner), `404` `SUBSCRIPTION_NOT_FOUND` (should never fire — see
the [error reference](#error-reference)), `429`.

### `GET /v1/billing/subscription`

The caller tenant's current plan, Stripe subscription state (if any), and live entitlement usage
against the plan — one combined read of `tenant_subscriptions` +
`BillingEntitlementsService.getEntitlements`. No query params.

For a tenant with a Stripe customer, `paymentMethod` is read from Stripe. That read is display-only: when it
fails (an outage, no Stripe keys, or a customer id Stripe doesn't know) the response still answers, with
`paymentMethod: null`, rather than failing the whole read.

Success `200` (a Free tenant that has never started a checkout):

```json
{
  "planCode": "free",
  "status": null,
  "currentPeriodStart": null,
  "currentPeriodEnd": null,
  "cancelAtPeriodEnd": false,
  "activeLocationCount": 1,
  "maxLocations": 1,
  "teamMemberCount": 1,
  "maxTeamMembers": 1,
  "aiDraftsUsedThisMonth": 0,
  "maxAiDraftsPerMonth": 20,
  "customPromptsEnabled": false
}
```

Success `200` (a Paid tenant mid-subscription):

```json
{
  "planCode": "paid",
  "status": "active",
  "currentPeriodStart": "2026-08-23T00:00:00.000Z",
  "currentPeriodEnd": "2026-09-23T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "activeLocationCount": 3,
  "maxLocations": null,
  "teamMemberCount": 4,
  "maxTeamMembers": null,
  "aiDraftsUsedThisMonth": 0,
  "maxAiDraftsPerMonth": null,
  "customPromptsEnabled": true
}
```

| Field | Type | Rules |
|---|---|---|
| `planCode` | enum | `free` \| `paid` |
| `status` | enum \| null | `active` \| `past_due` \| `canceled` \| `incomplete` (`subscription_status`). `null` for a pure-Free tenant with no Stripe object at all |
| `currentPeriodStart` / `currentPeriodEnd` | string (ISO) \| null | `null` until a Checkout session completes |
| `cancelAtPeriodEnd` | boolean | `true` while a canceled subscription is still inside its paid grace period — `planCode` stays `paid` with unlimited entitlements until the period actually ends (`customer.subscription.deleted`). See [Overview § Webhook state machine](./overview.md#webhook-state-machine) |
| `activeLocationCount` / `maxLocations` | integer / integer \| null | Locations where `status = 'active' AND billing_paused_at IS NULL`, vs. the plan's cap (`null` = unlimited) |
| `teamMemberCount` / `maxTeamMembers` | integer / integer \| null | Every roster row (owner + members, invited or active) — an invited-but-unaccepted seat still counts, since the owner already committed it |
| `aiDraftsUsedThisMonth` / `maxAiDraftsPerMonth` | integer / integer \| null | `review_responses` rows with `source = 'ai_generated'` since the start of the current UTC calendar month. Live in practice — the [AI module](../ai/overview.md)'s generation path persists exactly this row shape on every successful draft, and stops generating once the cap is reached |
| `customPromptsEnabled` | boolean | Whether this tenant's plan allows custom prompt template editing |

Errors: `401`, `403`, `404` `SUBSCRIPTION_NOT_FOUND`, `429`.

## Checkout & Customer Portal

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/billing/checkout` | Bearer, owner-only | global `short` tier (30/min) |
| `POST` | `/v1/billing/portal` | Bearer, owner-only | global `short` tier (30/min) |
| `POST` | `/v1/billing/checkout/reconcile` | Bearer, owner-only | global `short` tier (30/min) |

### `POST /v1/billing/checkout`

Creates (or reuses) a payment-provider customer for this tenant and starts a subscription Checkout
session against the Paid plan's `stripe_price_id`. **Gated on
`PAYMENT_FEATURE_ENABLED`** — the only route in this module that checks it. No request
body.

Success `201`:

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_a1B2c3D4E5f6G7h8I9j0#fidkdWxOYHwnPyd1blpxYHZxWjA0" }
```

| Field | Type | Rules |
|---|---|---|
| `url` | string | Redirect URL — the frontend navigates the browser to it. The Stripe Checkout page |

Errors: `403` `BILLING_NOT_ENABLED` (platform is not currently offering upgrades), `404`
`PLAN_NOT_FOUND` / `SUBSCRIPTION_NOT_FOUND`, `409` `ALREADY_SUBSCRIBED`, `401`, `429`.

**One paid subscription, even before the webhook lands.** `tenant_subscriptions.stripe_subscription_id`
stays `NULL` between a completed Checkout and its webhook (or a reconcile), so checking the row alone
would let a second Checkout through: pressing Back from Stripe, or a second tab, could buy a second
subscription. For a tenant that already has a Stripe customer, the route first calls
`PaymentProvider.prepareNewCheckout`:

- If Stripe reports a live subscription (`active`, `trialing` or `past_due`; an `unpaid` or abandoned `incomplete` one is cancelled instead, so it cannot block resubscribing),
  it is recorded on the row straight away (`BillingReconciliationService.reconcileTenantSubscription`;
  a failure there is logged and left to the webhook) and the request answers `409 ALREADY_SUBSCRIBED`.
- Otherwise every still-open Checkout Session for the customer is expired before the new one is
  created, so only the newest can be paid.

### `POST /v1/billing/checkout/reconcile`

Reads a Stripe Checkout Session directly and applies it, so a tenant who lands on the success page
is never left reading as unpaid just because `checkout.session.completed` was delayed or missed. The
frontend calls it once when Settings loads with `checkout=success&session_id=…` (Stripe substitutes
the `session_id` through the `{CHECKOUT_SESSION_ID}` token in `success_url`). Safe to call more than
once, and after the webhook already landed. Only a live (`active`/`past_due`) subscription moves the
tenant to Paid — a canceled or still-incomplete one is ignored. See
[Overview § Recovering from a missed webhook](./overview.md#recovering-from-a-missed-webhook).

Request body:

```json
{ "checkoutSessionId": "cs_test_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6" }
```

Success `200`: the refreshed subscription, same shape as `GET /v1/billing/subscription`.

Errors: `404` `CHECKOUT_SESSION_TENANT_MISMATCH` (the session belongs to a different tenant);
`503` `PAYMENT_NOT_CONFIGURED` (no Stripe keys).

### `POST /v1/billing/portal`

Creates a Customer Portal session so the tenant can manage or cancel their existing subscription.
**Deliberately not gated on `PAYMENT_FEATURE_ENABLED`** — an already-Paid tenant keeps
full Customer Portal access regardless of the deploy-level switch. No request body.

Success `201`:

```json
{ "url": "https://billing.stripe.com/p/session/test_YWNjdF8xTjJhQmNEZWZHaGlK" }
```

Errors: `404` `SUBSCRIPTION_NOT_FOUND` (no Stripe customer exists for this tenant yet — a Free
tenant that never started a checkout), `401`, `403`, `429`.

## Active location selection

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `PUT` | `/v1/billing/active-location` | Bearer, owner-only | global `short` tier (30/min) |

### `PUT /v1/billing/active-location`

Chooses which connected location stays active/unpaused under the current plan's `max_locations`
cap — only meaningful once the tenant has more connected locations than their plan allows (see
[Overview § Downgrading with multiple locations](./overview.md#downgrading-with-multiple-locations--the-location-choice-mechanism)).
Atomically pauses every other location and unpauses the chosen one; a no-op on a plan with no cap
(Paid).

Request body:

```json
{ "locationId": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0033" }
```

| Field | Type | Rules |
|---|---|---|
| `locationId` | string (uuid) | `@IsUUID()`. Must belong to the caller's tenant and be `status = 'active'` |

Success `200`: `data: null`.

Errors: `400` `LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION` (not this tenant's location, or
disconnected), `400` validation (`locationId` missing/not a UUID), `401`, `403`, `429`.

## Stripe webhook

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/billing/webhooks/stripe` | Public — Stripe signature, no JWT | exempt (`@SkipThrottle()`) |

### `POST /v1/billing/webhooks/stripe`

**The one route in this module with no Bearer auth**, and deliberately so: Stripe itself calls
this endpoint server-to-server and has no user JWT to present. `@Public()` skips the
`JwtAuthGuard`, and Stripe's own `Stripe-Signature` request header — verified against the exact
raw request bytes via `paymentProvider.constructWebhookEvent(req.rawBody, signature)` — is the
trust boundary instead, exactly like this codebase already treats OTP/token verification as the
trust boundary on other `@Public()` auth routes. `@ApiExcludeEndpoint()` keeps it out of the
interactive Swagger UI, since no human/API client is a legitimate caller.

This is also the one route in the whole backend that needs the *unparsed* request body: `req.rawBody`
is populated by a route-scoped `bodyParser.raw({ type: 'application/json' })`, registered in
`bootstrap.ts` ahead of the global `bodyParser.json()` (`rawBody: true` on the Nest app plus
Express's registration-order matching keeps every other route's JSON parsing untouched) — a
signature check is only meaningful against the exact bytes Stripe signed, never a re-serialized
parsed body.

Request: the raw Stripe event payload (`Buffer`), with a `Stripe-Signature` header. Not a fixed
JSON schema documented here — see [Stripe's own webhook payload reference](https://stripe.com/docs/api/events).
Idempotent per Stripe event id (`stripe_webhook_events`) — a duplicate delivery is detected and
skipped, still returning `200`. Unhandled Stripe event types (anything outside
`HANDLED_STRIPE_EVENT_TYPES` in `billing.constants.ts`) are logged and skipped, also `200`.

Success `200`: `data: null`.

Errors: `400` `STRIPE_WEBHOOK_SIGNATURE_INVALID` — either `req.rawBody`/the signature header is
missing, or `Stripe.webhooks.constructEvent` rejected the signature.
`404` `STRIPE_WEBHOOK_TENANT_NOT_FOUND` — no tenant matches the event's Stripe customer. The
transaction (including the idempotency-ledger row) is rolled back so Stripe retries; once the event
is more than an hour old it is acknowledged with `200` and logged instead.

## Error reference

Every row uses the shared error envelope described in [Conventions](#conventions). Several of
these exceptions are thrown from *other* modules' services (`ConnectionsService`, `PromptsService`,
`TenantMembersService`) rather than from `BillingController` itself — they are `billing.exceptions.ts`
exports because the entitlement rule they enforce is a billing concept, even though the HTTP route
that surfaces them belongs to a different module.

| Status | Code | Thrown by | When |
|---|---|---|---|
| `403` | `BILLING_NOT_ENABLED` | `POST /v1/billing/checkout` | `PAYMENT_FEATURE_ENABLED` is not `true` — this deploy isn't offering upgrades. Never blocks an already-Paid tenant's Portal access. |
| `404` | `PLAN_NOT_FOUND` | `POST /v1/billing/checkout`, any `BillingEntitlementsService.getEntitlements` call | The Paid plan row, or the tenant's own plan row, is missing — should never fire against a correctly-seeded `billing_plans` table. |
| `404` | `SUBSCRIPTION_NOT_FOUND` | `GET /v1/billing/plans`, `GET /v1/billing/subscription`, `POST /v1/billing/checkout`, `POST /v1/billing/portal` | No `tenant_subscriptions` row for this tenant. Should never fire in practice — every tenant gets a `free` subscription row in the same transaction that creates it (`AuthDbService.signup`/`completeGoogleSignup`). |
| `409` | `LOCATION_LIMIT_REACHED` | `POST /v1/connections/locations` confirm flow (`ConnectionsService.assertLocationLimit`, `ConnectionsDbService.confirmLocations`'s recheck) — not a billing-module route | The tenant's active, unpaused location count is already at `billing_plans.max_locations` for their plan. Reported as `409` by the connections module (a conflict with current state) with the plan-aware "upgrade to add more" message; a `403` of the same code is only raised by billing's own `LocationLimitReachedException` for the active-location choice. |
| `403` | `TEAM_MEMBER_LIMIT_REACHED` | `POST /v1/settings/members` (`TenantMembersService.sendInvite`) — not a billing-module route | The tenant's roster count is already at `max_team_members`. Distinct from `MEMBER_INVITES_DISABLED` (the platform-wide `invite_members_enabled` switch), since the two need different upsell copy. |
| `403` | `CUSTOM_PROMPTS_NOT_ON_PLAN` | `POST /v1/prompts/:promptId/versions` (`PromptsService.createVersion`) — not a billing-module route | The tenant's plan has `custom_prompts_enabled = false` (Free). Checked before the submitted template is even validated. |
| `400` | `STRIPE_WEBHOOK_SIGNATURE_INVALID` | `POST /v1/billing/webhooks/stripe` | Missing `req.rawBody`/`Stripe-Signature` header, or `Stripe.webhooks.constructEvent` rejected the signature. |
| `404` | `STRIPE_WEBHOOK_TENANT_NOT_FOUND` | `POST /v1/billing/webhooks/stripe` | No `tenant_subscriptions` row for the event's Stripe customer, and the event is less than an hour old. Rolled back so Stripe retries. |
| `404` | `CHECKOUT_SESSION_TENANT_MISMATCH` | `POST /v1/billing/checkout/reconcile` | The Checkout Session's `metadata.tenantId` isn't the caller's tenant, **or Stripe has no such session** — a made-up id is indistinguishable from someone else's, and never a `500` echoing Stripe's own wording. |
| `400` | `Validation Error` | `POST /v1/billing/checkout/reconcile` | `checkoutSessionId` isn't 1–255 characters of `A–Z a–z 0–9 _ -`. |
| `400` | `PAYMENT_METHOD_NOT_USABLE` | `PUT /v1/billing/payment-method` | Stripe rejected the id: it doesn't exist, or isn't attached to this tenant's customer. (A body that isn't a `pm_…` id at all is a `400 Validation Error` before Stripe is called.) |
| `503` | `PAYMENT_NOT_CONFIGURED` | Any route that calls Stripe (checkout, reconcile, cancel, profile, card) | `STRIPE_SECRET_KEY` is empty. Only possible while `PAYMENT_FEATURE_ENABLED` is off and outside production. |
| `400` | `LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION` | `PUT /v1/billing/active-location` | The given `locationId` isn't this tenant's own, or isn't `status = 'active'` (disconnected). |
| `400` | `Validation Error` | `PUT /v1/billing/active-location` | `locationId` missing or not a UUID. `message` is the comma-joined list of violations. |
| `401` | `Unauthorized` | Every `BillingController` route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | Every `BillingController` route | `RolesGuard` rejecting a token whose role isn't `owner` (a `member` token, or a `platform_admin` token, both fail closed here). |
| `429` | `Too Many Requests` | Any route in this module | The global `short` tier (30/min) exceeded — no route here has its own override. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. Only `traceId` is safe to surface; detail stays server-side per `ErrorHandlerService.handleUnhandledError`. |
