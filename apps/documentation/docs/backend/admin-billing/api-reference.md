---
sidebar_position: 2
---

# Admin Billing Module — API Reference

## How to read this document

This describes the admin-billing module **as it is actually implemented** —
`src/api/admin/controllers/admin-billing.controller.ts`,
`src/api/admin/services/admin-billing.service.ts`,
`src/api/admin/swagger/admin-billing.swagger.ts`, the `dto/` classes it returns, and
`AdminBillingDbService` + `AdminBillingRepository` under `src/db/repositories/admin-billing/`.
Every route, field, and default below is read straight off shipped code.

It assumes you have read [Admin Billing Module — Overview](./overview.md) for why the webhook
activity endpoint never surfaces raw/ignored Stripe traffic and how the plan-split/upgrade-trend
figures are derived. Those narratives are not repeated here.

## Conventions

- **Base path**: `/v1/admin/billing/...` — `RouteNames.ADMIN_BILLING` (`'admin/billing'`),
  `version: '1'` on the controller.
- **Auth column**: `Bearer, platform admin`. Every route carries
  `@Roles(JwtTokenType.PLATFORM_ADMIN)`; a `tenant_user` token fails closed. Every handler also
  re-checks via `requirePlatformAdmin(actor, MESSAGES.ADMIN.ADMIN_ONLY)` in the service layer.
- **Throttle**: no route in this controller carries a `@Throttle()` override, so all three fall
  back to the global `short` tier — 30 requests/minute.
- **Envelopes**: success payloads shown below are the *inner* `data` — `TransformInterceptor` wraps
  every 2xx as `{ statusCode, status, message, data }`. See the auth reference's
  [Conventions](../auth/api-reference.md#conventions) for the full envelope shape.
- **Timestamps** are ISO 8601 UTC strings.

## Has-paid-tenants

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/billing/has-paid-tenants` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/billing/has-paid-tenants`

A cheap existence check, not the full summary — backs the admin frontend's Billing nav item and
Billing page route guard, which must stay available whenever at least one tenant is still on Paid,
independent of `PAYMENT_FEATURE_ENABLED` (that flag only ever gates *starting a new checkout*, never
an already-Paid tenant's subscription). No query params.

Success `200`:

```json
{ "hasPaidTenants": true }
```

Errors: `401`, `403`, `429`.

## Billing summary

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/billing/summary` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/billing/summary`

Plan split, subscription status breakdown, Free-to-Paid upgrade trend, and at-risk (past-due)
subscriptions — the one place any of `billing_plans`/`tenant_subscriptions` gets an admin-facing
read. Webhook activity is the separate, paginated endpoint below.

| Query param | Type | Rules |
|---|---|---|
| `months` | integer | optional, default `6`. How many trailing calendar months `upgradeTrend` covers, counting back from the current one (inclusive). The other figures are all-time, not windowed. Example: `6` |

Success `200`:

```json
{
  "freeCount": 121,
  "paidCount": 7,
  "activeCount": 6,
  "pastDueCount": 1,
  "canceledCount": 0,
  "incompleteCount": 0,
  "cancelingCount": 2,
  "upgradeTrend": [
    { "monthKey": "2026-04", "count": 1 },
    { "monthKey": "2026-05", "count": 0 },
    { "monthKey": "2026-06", "count": 2 },
    { "monthKey": "2026-07", "count": 1 },
    { "monthKey": "2026-08", "count": 2 },
    { "monthKey": "2026-09", "count": 1 }
  ],
  "atRisk": [
    {
      "tenantId": "0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
      "businessName": "The Coastal Table",
      "status": "past_due",
      "currentPeriodEnd": "2026-09-01T00:00:00.000Z"
    }
  ],
  "postErasureCharges": [
    {
      "receiptId": "0190f3bb-1c2d-7e4f-8a9b-0c1d2e3f4a5b",
      "tenantId": "0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
      "businessName": "The Coastal Table",
      "invoiceNumber": "8E8B7F1-0007",
      "amountPaid": 4900,
      "currency": "usd",
      "paidAt": "2026-09-30T23:41:00.000Z"
    }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `freeCount` / `paidCount` | integer | Tenants on each plan, per `tenant_subscriptions.plan_id` |
| `activeCount` / `pastDueCount` / `canceledCount` / `incompleteCount` | integer | `tenant_subscriptions.status`, `NULL` (pure-Free, never checked out) excluded from all four |
| `cancelingCount` | integer | `cancel_at_period_end = true` — still Paid and billed until the period ends |
| `upgradeTrend[].monthKey` | string | `YYYY-MM`, zero-padded, UTC. Every month in the window is present, including zero-count ones |
| `upgradeTrend[].count` | integer | `checkout.session.completed` webhook deliveries that month |
| `atRisk[]` | array | Past-due subscriptions, most recently updated first, capped at 10 |
| `postErasureCharges[]` | array | Payments that succeeded **after** the business's erasure was requested and have not been marked handled — newest first, capped at 20. See [the refund rule](./overview.md#charged-after-an-erasure-request-the-refund-rule-and-the-manual-queue). `amountPaid` is the smallest currency unit (cents) |

Errors: `401`, `403`, `429`.

## Marking a post-erasure charge handled

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/admin/billing/post-erasure-charges/:receiptId/resolve` | Bearer, platform admin | global `short` tier (30/min) |

### `POST /v1/admin/billing/post-erasure-charges/:receiptId/resolve`

Removes one entry from `postErasureCharges` after an admin has refunded it in Stripe (or decided not
to). Idempotent in effect: resolving an already-resolved entry is a `404`, the same as an unknown
one, and the first resolver's identity and time are kept. Does **not** talk to Stripe.

Success `200`: `{ "message": "Marked as handled." }`

Errors: `400` (`receiptId` is not a UUID), `401`, `403`, `404 POST_ERASURE_CHARGE_NOT_FOUND` (unknown id, not flagged, or already
handled), `429`.

## Webhook activity

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/admin/billing/webhook-events` | Bearer, platform admin | global `short` tier (30/min) |

### `GET /v1/admin/billing/webhook-events`

The Stripe webhook deliveries `BillingWebhooksService` actually acts on, newest first, resolved to
the tenant its Stripe customer id belongs to where possible (`null` for an orphan delivery). Every
other Stripe event type this app receives and ignores is out of scope for this endpoint entirely —
see [Overview § Webhook activity](./overview.md#webhook-activity-paginated-search-side-lists-only-the-handled-event-types)
for why there is no way to widen it back to the raw feed.

| Query param | Type | Rules |
|---|---|---|
| `page` | integer | optional, default `1`, min `1`. Example: `1` |
| `pageSize` | integer | optional, default `20`, min `1`, max `100`. Example: `20` |
| `type` | string | optional, one of `StripeWebhookEventType`'s own key names — `CHECKOUT_SESSION_COMPLETED` \| `SUBSCRIPTION_UPDATED` \| `SUBSCRIPTION_DELETED` \| `INVOICE_PAYMENT_FAILED` \| `INVOICE_PAYMENT_SUCCEEDED`. Not Stripe's raw dotted wire format. Example: `CHECKOUT_SESSION_COMPLETED` |

Success `200`:

```json
{
  "events": [
    {
      "id": "evt_1UJ8pAPZYAmQ4L9BbRlyLvwZ",
      "type": "checkout.session.completed",
      "processedAt": "2026-09-24T09:27:54.169Z",
      "tenantId": "0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
      "businessName": "The Coastal Table"
    },
    {
      "id": "evt_2VK9qBQaZBnR5M0CcSmzMwxA",
      "type": "invoice.payment_succeeded",
      "processedAt": "2026-09-24T09:15:02.881Z",
      "tenantId": null,
      "businessName": null
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 2, "totalPages": 1 }
}
```

| Field | Type | Rules |
|---|---|---|
| `events[].id` | string | Stripe's own event id (`evt_...`) |
| `events[].type` | string | Always one of the 5 handled types — Stripe's raw dotted wire format, not the `type` filter's own key vocabulary |
| `events[].processedAt` | string (ISO) | `stripe_webhook_events.processed_at` |
| `events[].tenantId` / `events[].businessName` | string \| null | `null` for an orphan delivery — its Stripe customer id matches no tenant |
| `meta` | `PaginationMetaDto` | `{ page, pageSize, total, totalPages }` |

Errors: `400` validation (`type` not one of the 5 key names, `page`/`pageSize` non-integer or out
of range), `401`, `403`, `429`.

## Error reference

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | `GET /webhook-events` | A `class-validator` rule failed — unrecognized `type` key, or `page`/`pageSize` outside their bounds. |
| `404` | `POST_ERASURE_CHARGE_NOT_FOUND` | `POST /post-erasure-charges/:receiptId/resolve` | No unresolved, flagged receipt with that id. |
| `401` | `Unauthorized` | Every route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | Every route | `RolesGuard` rejecting a token whose `type` isn't `platform_admin`. |
| `429` | `Too Many Requests` | Any route | The global `short` tier (30/min) exceeded. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. Only `traceId` is safe to surface. |
