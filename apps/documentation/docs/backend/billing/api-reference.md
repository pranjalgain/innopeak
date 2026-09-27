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
Free/Paid entitlement split, the platform-wide `billing_enabled` flag, the Dummy/Stripe plugin
pattern, and the webhook state machine. Those narratives are not repeated here — this document
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
- **Throttle**: no route in either controller carries a `@Throttle()` override, so every route
  falls back to the global `short` tier — 30 requests/minute (`ThrottlerModule.forRoot`,
  `app.module.ts`), shared with every other unthrottled route in the app.
- **Envelopes**: success payloads shown below are the *inner* `data` — `TransformInterceptor` wraps
  every 2xx as `{ statusCode, status, message, data }`. Every non-2xx is
  `{ statusCode, status, message, error, traceId, data: null }` via `HttpExceptionFilter` +
  `ErrorHandlerService`. See the auth reference's [Conventions](../auth/api-reference.md#conventions)
  for the full version with worked envelope examples.
- **Timestamps** are ISO 8601 UTC strings. **Ids** are `uuidv7()` values, except Stripe's own
  ids (`cus_...`, `sub_...`, `evt_...`, `cs_...`) and this module's own Dummy-provider fakes
  (`dummy_cus_<uuid>`, `dummy_sub_<uuid>`), which are opaque strings from the payment provider.

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
| `aiDraftsUsedThisMonth` / `maxAiDraftsPerMonth` | integer / integer \| null | `review_responses` rows with `source = 'ai_generated'` since the start of the current UTC calendar month. Live in practice — the [AI module](../ai/overview.md)'s real generation path persists exactly this row shape on every successful draft; only its dry-run path never contributes, see [Overview § Known limitations](./overview.md#known-limitations--follow-up-work) |
| `customPromptsEnabled` | boolean | Whether this tenant's plan allows custom prompt template editing |

Errors: `401`, `403`, `404` `SUBSCRIPTION_NOT_FOUND`, `429`.

## Checkout & Customer Portal

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/billing/checkout` | Bearer, owner-only | global `short` tier (30/min) |
| `POST` | `/v1/billing/portal` | Bearer, owner-only | global `short` tier (30/min) |

### `POST /v1/billing/checkout`

Creates (or reuses) a payment-provider customer for this tenant and starts a subscription Checkout
session against the Paid plan's `stripe_price_id`. **Gated on
`platform_settings.billing_enabled`** — the only route in this module that checks it. No request
body.

Success `201` (real Stripe, `PAYMENT_PROVIDER=stripe`):

```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_a1B2c3D4E5f6G7h8I9j0#fidkdWxOYHwnPyd1blpxYHZxWjA0" }
```

Success `201` (`DummyPaymentProvider`, the default):

```json
{ "url": "https://app.innopeak.com/billing/dummy-checkout?tenantId=0190f4c1-88ba-7a55-8410-6d3f9e0c7722&customerId=dummy_cus_0f3e9a2b-6b41-4c5a-9d2e-1a7c4f8e9b10&subscriptionId=dummy_sub_5b1e7c3a-2f44-4a9b-8e10-3c9d5f0a1b22" }
```

| Field | Type | Rules |
|---|---|---|
| `url` | string | Redirect URL — the frontend navigates the browser to it. Real Stripe Checkout, or a local Dummy confirmation page carrying `tenantId`/`customerId`/`subscriptionId` as query params (see [Overview § payment-provider plugin pattern](./overview.md#the-payment-provider-plugin-pattern-dummy-vs-stripe)) |

Errors: `403` `BILLING_NOT_ENABLED` (platform is not currently offering upgrades), `404`
`PLAN_NOT_FOUND` / `SUBSCRIPTION_NOT_FOUND`, `401`, `429`.

### `POST /v1/billing/portal`

Creates a Customer Portal session so the tenant can manage or cancel their existing subscription.
**Deliberately not gated on `platform_settings.billing_enabled`** — an already-Paid tenant keeps
full Customer Portal access regardless of the platform-wide switch. No request body.

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
| `POST` | `/v1/billing/webhooks/stripe` | Public — Stripe signature, no JWT | global `short` tier (30/min) |

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

## Error reference

Every row uses the shared error envelope described in [Conventions](#conventions). Several of
these exceptions are thrown from *other* modules' services (`ConnectionsService`, `PromptsService`,
`TenantMembersService`) rather than from `BillingController` itself — they are `billing.exceptions.ts`
exports because the entitlement rule they enforce is a billing concept, even though the HTTP route
that surfaces them belongs to a different module.

| Status | Code | Thrown by | When |
|---|---|---|---|
| `403` | `BILLING_NOT_ENABLED` | `POST /v1/billing/checkout` | `platform_settings.billing_enabled` is not `true` — the platform isn't currently offering upgrades. Never blocks an already-Paid tenant's Portal access. |
| `404` | `PLAN_NOT_FOUND` | `POST /v1/billing/checkout`, any `BillingEntitlementsService.getEntitlements` call | The Paid plan row, or the tenant's own plan row, is missing — should never fire against a correctly-seeded `billing_plans` table. |
| `404` | `SUBSCRIPTION_NOT_FOUND` | `GET /v1/billing/plans`, `GET /v1/billing/subscription`, `POST /v1/billing/checkout`, `POST /v1/billing/portal` | No `tenant_subscriptions` row for this tenant. Should never fire in practice — every tenant gets a `free` subscription row in the same transaction that creates it (`AuthDbService.signup`/`completeGoogleSignup`). |
| `403` | `LOCATION_LIMIT_REACHED` | `POST /v1/connections/google/available-locations` confirm flow (`ConnectionsService.assertLocationLimit`, `ConnectionsDbService.confirmLocations`'s recheck) — not a billing-module route | The tenant's active, unpaused location count is already at `billing_plans.max_locations` for their plan. |
| `403` | `TEAM_MEMBER_LIMIT_REACHED` | `POST /v1/settings/members` (`TenantMembersService.sendInvite`) — not a billing-module route | The tenant's roster count is already at `max_team_members`. Distinct from `MEMBER_INVITES_DISABLED` (the platform-wide `invite_members_enabled` switch), since the two need different upsell copy. |
| `403` | `CUSTOM_PROMPTS_NOT_ON_PLAN` | `POST /v1/prompts/:promptId/versions` (`PromptsService.createVersion`) — not a billing-module route | The tenant's plan has `custom_prompts_enabled = false` (Free). Checked before the submitted template is even validated. |
| `403` | `AI_DRAFT_LIMIT_REACHED` | `POST /v1/ai/dry-run` (not a billing-module route) | `BillingEntitlementsService.canGenerateAiDraft` returned false — see [AI Module § Billing entitlement check](../ai/overview.md#billing-entitlement-check-everywhere-generation-can-run). Fires once the tenant's real generation path (`generateForClassifiedReviews`) has persisted 20 `ai_generated` drafts this month — the dry-run route shares the check but never contributes to the count itself. |
| `400` | `STRIPE_WEBHOOK_SIGNATURE_INVALID` | `POST /v1/billing/webhooks/stripe` | Missing `req.rawBody`/`Stripe-Signature` header, or `Stripe.webhooks.constructEvent` rejected the signature. |
| `400` | `LOCATION_NOT_ELIGIBLE_FOR_ACTIVATION` | `PUT /v1/billing/active-location` | The given `locationId` isn't this tenant's own, or isn't `status = 'active'` (disconnected). |
| `400` | `Validation Error` | `PUT /v1/billing/active-location` | `locationId` missing or not a UUID. `message` is the comma-joined list of violations. |
| `401` | `Unauthorized` | Every `BillingController` route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | Every `BillingController` route | `RolesGuard` rejecting a token whose role isn't `owner` (a `member` token, or a `platform_admin` token, both fail closed here). |
| `429` | `Too Many Requests` | Any route in this module | The global `short` tier (30/min) exceeded — no route here has its own override. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. Only `traceId` is safe to surface; detail stays server-side per `ErrorHandlerService.handleUnhandledError`. |
