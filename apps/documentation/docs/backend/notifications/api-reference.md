---
sidebar_position: 2
---

# Notifications Module — API Reference

## How to read this document

This is the **target/spec design** for the notifications module's HTTP surface. **No code exists
for it yet** — `apps/backend/src/notifications/` is unrelated boilerplate for a different product
(FCM push / in-app), not an earlier draft of this, and must not be retrofitted; see
[Gap § 3](./overview.md#3-srcnotifications-is-unrelated-boilerplate). It assumes you have read
[Notifications Module — Overview](./overview.md) for the data model, the two-faces distinction, and
the flow narratives; this document does not repeat those, it turns them into request/response
contracts.

This document is intentionally HTTP-contract-level only — no controller or decorator code. When
implementing a route below, it lives under `src/api/notifications/` per
`apps/backend/docs/conventions/module-structure.md`, split across two controllers (feed vs.
delivery ledger) with one `swagger/` file each. The request/response JSON shown here is what that
route's composed Swagger decorator should render as its example, and every success/error `message`
string comes from `src/common/constants/messages.constants.ts` — which **does not exist yet** and
is created by the first module to need it — never an inline literal.

**Some routes below depend on a follow-up migration.** The four
[in-app notification centre](#in-app-notification-centre) routes require the
`in_app_notifications` table specified in
[Gap § 1](./overview.md#1-the-in-app-notification-centre-has-no-table-the-big-one); they cannot be
built against today's schema, because the `notifications` table has no `title`, no `description`, a
`NOT NULL review_id`, a single-value `notification_type`, one row *per channel* rather than per
event, and a `read_at` column that means email-open telemetry rather than a user action. The two
[delivery ledger](#delivery-ledger) routes work against today's schema, with one degradation
(`failureReason`) noted inline. Every route is marked.

## Conventions

- **Base path** — every route is `/v1/notifications/...` (`RouteNames.NOTIFICATIONS`, already
  present in `src/common/route-names.ts`; `version: '1'` in `@Controller()`).
- **Auth column** — `Bearer` means `Authorization: Bearer <access_token>` or the equivalent `sid`
  cookie, which `CookieAuthMiddleware` promotes before the guards run. `Bearer + owner` adds
  `@Roles('owner')`. No route in this module is `@Public()`.
- **Tenant scoping** — every query is filtered by `tenant_id` from the JWT, *and* the feed routes
  are additionally filtered by `recipient` user id. A user only ever reads their own feed rows;
  never accept a user id from the request.
- **Token type must be checked before `tenant_id` is trusted.** Every route here requires
  `type === 'tenant_user'` (or a `support_access` token, which is read-only — see
  [Platform Admin](../platform-admin/api-reference.md#conventions)). This is not belt-and-braces:
  a `platform_admin` token carries **no** `tenantId` claim at all, so an unchecked route builds
  `WHERE tenant_id = undefined`, and in the usual Drizzle idiom
  `and(...[tenantId && eq(t.tenantId, tenantId), ...])` a falsy term is *dropped* rather than
  matching nothing — the tenant filter silently disappears and the endpoint returns every
  tenant's rows. Auth's security notes call this "the highest-severity mistake available in this
  module"; see [session/token model](../auth/api-reference.md#session--token-model-1).
- **Envelopes** — 2xx bodies are wrapped by `TransformInterceptor` and non-2xx by
  `HttpExceptionFilter` (`src/common/dto/api-response.ts`). The `data` shapes below are the *inner*
  payload. The full envelope spec — success shape, error shape, `traceId`, and how
  `class-validator` failures collapse into one `message` — is not repeated here; see
  [Auth Module — API Reference § Conventions](../auth/api-reference.md#conventions).
- **Pagination** — every list route returns
  `{ data: [...], meta: { page, pageSize, total, totalPages } }`, with query params as one DTO and
  `totalPages` computed in the service, not the controller
  (`apps/backend/docs/conventions/api-patterns.md`).
- **Throttling** — all routes fall back to the global `short` tier (30/min). No route here needs a
  tighter limit; the feed's write routes are frequent, low-stakes, and self-scoped.

## Once-only notification per escalation event

This is behavioural API truth, not an implementation footnote, and it is the thing most likely to
be misread by a client of the [delivery ledger](#delivery-ledger). `PLAN.md` §8.13 is the source.

`notifications` carries a unique index on
`(review_id, recipient_user_id, type, generation_group_id)`. Three consequences a client must
encode:

1. **Within one escalation event, a recipient is notified at most once per type — never twice.** A
   retried send (worker redelivery, duplicate queue message, manual re-run) collides on that index
   and must be written `ON CONFLICT DO NOTHING` to be a no-op rather than an aborted transaction.
   Note the guarantee is per *type*, not per channel: `channel` is absent from the index, so a
   `both` preference cannot currently produce its two rows at all — see the
   [overview](./overview.md#data-model) for the required index widening. There is deliberately **no re-send endpoint**: `POST`-ing a resend would
   either violate this guarantee or silently do nothing, and neither is a useful API. If an
   escalation email genuinely needs to go out again, that is a new escalation event with a new
   `generation_group_id`, produced by the pipeline — not an action a client can request.
2. **Across escalation events, the same review can notify again.** A review that escalates, gets
   handled, and escalates again on an upstream edit (`PLAN.md` §8.6, §8.12) keeps the same
   `reviews.id` but gets a fresh `generation_group_id`, and therefore *does* notify again. So
   `GET /v1/notifications/deliveries?reviewId=<id>` legitimately returns **multiple rows for one
   review**, and a client showing "was this escalation notified?" must group by
   `generationGroupId` — not by `reviewId`. Collapsing on `reviewId` alone will report the first
   escalation's outcome for the second one.
3. **A row with `generationGroupId: null` is not deduplicated.** Postgres treats `NULL`s in a
   unique index as distinct, so nothing stops two such rows existing. `generation_group_id` is
   nullable with no FK; keeping it populated on the `escalation` path is an application invariant
   the database does not enforce. A `null` in this field on a delivery row is a **bug signal**, and
   a monitoring query worth having.

The equivalent guarantee on the in-app feed side is
`idx_in_app_notifications_dedupe`, with the same shape and the same NULL caveat — see
[Gap § 1](./overview.md#1-the-in-app-notification-centre-has-no-table-the-big-one), where
`connection_issue`'s deliberate exemption from dedupe is explained.

## In-app notification centre

**Every route in this section requires the `in_app_notifications` follow-up migration.** They read
and write that table only; they never touch `notifications`.

These four routes are the exact surface the already-shipped frontend expects. Today
`apps/web/src/app/_libs/services/notification.service.ts` fakes all four against
`MOCK_NOTIFICATIONS`; replacing that mock body with real calls to these routes is the entire
frontend change.

| Method | Path | Auth | Migration |
|---|---|---|---|
| `GET` | `/v1/notifications` | Bearer | Required |
| `GET` | `/v1/notifications/unread-count` | Bearer | Required |
| `PATCH` | `/v1/notifications/:id/read` | Bearer | Required |
| `PATCH` | `/v1/notifications/read-all` | Bearer | Required |

### `GET /v1/notifications`

The bell popover's feed: the current user's in-app notifications, newest first, paginated. Scoped
to `tenant_id` from the JWT **and** `user_id` from the JWT — there is no parameter for reading
another user's feed, at any role. An owner has no privileged view of a member's notifications;
that would be a different resource with a different justification, and nothing in `PLAN.md` asks
for it.

Ordering is `created_at DESC, id DESC`. The tiebreaker is not cosmetic: `id` is `uuidv7()`, so it
is monotonic with creation time, and two rows written in the same escalation fan-out can share a
`created_at` to the microsecond. Without it, pagination can drop or repeat a row across pages.
Served by `idx_in_app_notifications_user_created`.

Request query params:

```json
{ "page": 1, "pageSize": 20, "unreadOnly": false }
```

| Field | Type | Rules |
|---|---|---|
| `page` | integer | optional, default `1`, min `1` |
| `pageSize` | integer | optional, default `20`, min `1`, max `50`. The popover renders 20 with a scroll container; the cap exists so a client can't ask for the whole history in one call. |
| `unreadOnly` | boolean | optional, default `false`. When `true`, filters `read_at IS NULL` — served by the partial index `idx_in_app_notifications_user_unread`. Not used by the current panel, which renders read and unread together and styles them differently. |

Success `200`:

```json
{
  "data": [
    {
      "id": "0190f3b2-8c41-7a2e-9f5d-11c0de44aa01",
      "type": "review_escalated",
      "title": "Review escalated",
      "description": "A 1-star review from Jordan P. was flagged for low rating and needs your attention.",
      "createdAt": "2026-09-03T09:15:00.000Z",
      "isRead": false,
      "reviewId": "0190f3aa-1f02-7bb1-8e30-91ab77cc2201"
    },
    {
      "id": "0190f3b2-8c41-7a2e-9f5d-11c0de44a9fe",
      "type": "connection_issue",
      "title": "Google sync delayed",
      "description": "New reviews may take longer than usual to appear while Google Business Profile sync recovers.",
      "createdAt": "2026-09-01T14:00:00.000Z",
      "isRead": true,
      "reviewId": null
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 5, "totalPages": 1 }
}
```

`isRead` is `read_at !== null`, computed in the DB service. The raw timestamp is deliberately not
exposed — the frontend's `Notification` type has no field for it, and shipping a timestamp nobody
renders invites someone to start branching on it. `reviewId` is `null` rather than omitted, so the
shape is stable across rows; the frontend's `reviewId?: string` tolerates both, and a
consistently-present key is easier to reason about in a table.

Errors: `401`.

### `GET /v1/notifications/unread-count`

Powers the red dot on the bell icon. A separate endpoint rather than a field on the list's `meta`,
for one concrete reason: the frontend currently derives the count client-side from the loaded array
(`use-notifications.ts` filters on `!isRead`), which works only because the mock returns every
notification at once. Once the list is paginated server-side, a count derived from page 1 is wrong
the moment there are more than `pageSize` notifications. This route is also the only call the shell
needs on mount if the popover is never opened — it is a single `COUNT(*)` against
`idx_in_app_notifications_user_unread`, far cheaper than fetching a page of rows to count them.

Success `200`:

```json
{ "unreadCount": 3 }
```

| Field | Type | Rules |
|---|---|---|
| `unreadCount` | integer | `COUNT(*)` where `user_id = <jwt>` and `read_at IS NULL`. `0` when there are none — never `null`. |

Errors: `401`.

### `PATCH /v1/notifications/:id/read`

Marks one notification read. Fired by the panel when a row is clicked — either on the deep-link
`Link` or the plain `button` for a review-less row.

**Idempotent by contract.** `UPDATE ... SET read_at = COALESCE(read_at, now()) WHERE id = ? AND
user_id = <jwt>` — re-marking an already-read row succeeds and leaves the original timestamp
intact. This is not politeness: `use-notifications.ts` marks read optimistically, fires the request
with `void`, and surfaces nothing on failure, so a user clicking the same row twice must not
produce an error nobody will ever see. `PATCH`, not `POST`, for the same reason.

A row belonging to another user returns `404`, not `403` — the two are deliberately
indistinguishable, so this endpoint cannot be used to probe whether a given notification id exists
on someone else's feed. Same reasoning as auth's
[enumeration prevention](../auth/api-reference.md#security-considerations).

| Field | Type | Rules |
|---|---|---|
| `id` (path) | string | required, UUID (`ParseUUIDPipe`). A malformed UUID is `400`, not `404`. |

No request body.

Success `200`:

```json
{
  "id": "0190f3b2-8c41-7a2e-9f5d-11c0de44aa01",
  "type": "review_escalated",
  "title": "Review escalated",
  "description": "A 1-star review from Jordan P. was flagged for low rating and needs your attention.",
  "createdAt": "2026-09-03T09:15:00.000Z",
  "isRead": true,
  "reviewId": "0190f3aa-1f02-7bb1-8e30-91ab77cc2201"
}
```

Returning the full updated row rather than `204` lets a client that *does* care reconcile its
optimistic state. The current frontend ignores the body entirely; that is fine and expected.

Errors: `400` (malformed UUID), `401`, `404 NOTIFICATION_NOT_FOUND`.

### `PATCH /v1/notifications/read-all`

Marks every unread notification read for the current user — the popover header's "mark all as
read" button, which the panel disables when `unreadCount === 0`.

`UPDATE in_app_notifications SET read_at = now() WHERE user_id = <jwt> AND read_at IS NULL`. The
`read_at IS NULL` predicate is load-bearing twice over: it preserves the original read timestamps
of already-read rows, and it keeps the write set small enough that the row-level audit trigger
(`log_db_changes()`, one `audit_logs` row per updated row — see
[Gap § 1](./overview.md#1-the-in-app-notification-centre-has-no-table-the-big-one)) stays
proportional to what actually changed rather than to the user's whole history.

**Not scoped by `page` or by anything else.** It marks the user's entire unread set, including rows
the client has never fetched. That matches the button's label and is the behaviour the frontend
already implements locally.

No request body.

Success `200`:

```json
{ "updatedCount": 3 }
```

| Field | Type | Rules |
|---|---|---|
| `updatedCount` | integer | Rows actually transitioned to read. `0` when nothing was unread — a success, not a `404` or `409`. A client must not treat `0` as an error; the button being enabled is based on a possibly-stale count. |

Errors: `401`.

**Route ordering.** `read-all` and `:id/read` do not collide (different segment counts), but
`unread-count` and `deliveries` are static segments under the same prefix. If a
`GET /v1/notifications/:id` is ever added, it must be registered after them — see
[Gap § 4](./overview.md#4-module-structure-conventions-the-new-module-must-follow).

## Delivery ledger

**These two routes work against today's schema**, with one degradation: `failureReason` is always
`null` until `notifications.error_message` is added, because a failed delivery currently records
`status = 'failed'` and nothing more. See
[Gap § 2](./overview.md#2-a-failed-delivery-records-no-reason).

This is the operational face of the module and answers a question that has no answer at all right
now: *did the escalation email or Teams message actually go out, to whom, and what happened if it
didn't?* It reads `notifications` exactly as `PLAN.md` §2 and §4.1 designed it.

| Method | Path | Auth | Migration |
|---|---|---|---|
| `GET` | `/v1/notifications/deliveries` | Bearer + `owner` | Not required |
| `GET` | `/v1/notifications/deliveries/:id` | Bearer + `owner` | Not required |

Owner-only, deliberately. A delivery record names *other* users as recipients along with their
contact channel, which is an administrative view of who-was-told-what, not a personal feed. The
frontend's `users.role` enum has exactly two values (`owner` \| `member`), so `@Roles('owner')` is
the whole restriction; note that `RolesGuard` needs the rework described in
[Auth § Gap](../auth/overview.md#gap-between-current-code-and-target-design) before it can enforce
the schema's single-`role` model at all.

### `GET /v1/notifications/deliveries`

The escalation-notification history for the tenant, newest first, paginated and filterable. Two
uses drive the filter set: "show me the delivery outcome for this specific escalated review"
(`reviewId`), and "show me everything that failed or is stuck" (`status`).

`status = 'pending'` on an old row is a real operational condition, not a transient one — the
ledger row is written *before* the send is attempted (see
[Overview § Escalation flow](./overview.md#escalation--fan-out--delivery--status)), so a worker
that crashed mid-send leaves exactly this trace. That is the intended design, and a
`?status=pending` query sorted oldest-first is how you find those; it is the reason the write
happens first.

Ordering is `created_at DESC, id DESC`, same `uuidv7()` tiebreaker reasoning as the feed — and it
matters more here, since a fan-out writes several rows in one transaction.

Request query params:

```json
{
  "page": 1,
  "pageSize": 20,
  "reviewId": "0190f3aa-1f02-7bb1-8e30-91ab77cc2201",
  "status": "failed",
  "channel": "email"
}
```

| Field | Type | Rules |
|---|---|---|
| `page` | integer | optional, default `1`, min `1` |
| `pageSize` | integer | optional, default `20`, min `1`, max `100` |
| `reviewId` | string | optional, UUID. Filters `review_id`. Served by `idx_notifications_review_id`. **May match multiple escalation events** — group by `generationGroupId`, see [Once-only notification](#once-only-notification-per-escalation-event). |
| `status` | string | optional, one of `pending` \| `sent` \| `failed` (`notification_status`). Anything else is `400`. |
| `channel` | string | optional, one of `email` \| `teams` (`notification_channel`). **`both` is not valid here** — it belongs to `notification_channel_pref` on the settings-owned `notification_recipients` table, never to a delivery record; see [Overview § Enums](./overview.md#enums). Passing it is `400`. |
| `type` | string | optional, only value `escalation` (`notification_type`). Accepted for forward-compatibility; filtering by it is a no-op today. |

Success `200`:

```json
{
  "data": [
    {
      "id": "0190f3c1-2200-7c10-b4a2-5566aabbcc01",
      "reviewId": "0190f3aa-1f02-7bb1-8e30-91ab77cc2201",
      "generationGroupId": "0190f3c0-9ab1-7f44-8d21-0011223344ff",
      "recipient": {
        "id": "0190f3b2-0000-7000-8000-000000000001",
        "name": "Jane Doe",
        "email": "jane@thecoffeehouse.com"
      },
      "type": "escalation",
      "channel": "email",
      "status": "failed",
      "sentAt": null,
      "readAt": null,
      "failureReason": null,
      "createdAt": "2026-09-03T09:15:02.114Z"
    },
    {
      "id": "0190f3c1-2200-7c10-b4a2-5566aabbcc00",
      "reviewId": "0190f3aa-1f02-7bb1-8e30-91ab77cc2201",
      "generationGroupId": "0190f3c0-9ab1-7f44-8d21-0011223344ff",
      "recipient": {
        "id": "0190f3b2-0000-7000-8000-000000000001",
        "name": "Jane Doe",
        "email": "jane@thecoffeehouse.com"
      },
      "type": "escalation",
      "channel": "teams",
      "status": "sent",
      "sentAt": "2026-09-03T09:15:03.902Z",
      "readAt": "2026-09-03T09:41:10.000Z",
      "failureReason": null,
      "createdAt": "2026-09-03T09:15:02.109Z"
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 2, "totalPages": 1 }
}
```

Those two rows are one escalation to one recipient whose preference was `both` — the shape the feed
must never show, and the shape this endpoint must. Same `reviewId`, same `generationGroupId`,
different `channel`, independent `status`.

| Field | Type | Rules |
|---|---|---|
| `id` | string | `notifications.id`. |
| `reviewId` | string | Never `null` — `review_id` is `NOT NULL`. |
| `generationGroupId` | string \| null | Which snippet batch was included at send time (`PLAN.md` §2). **`null` is a bug signal**, not a normal state — see [Once-only notification](#once-only-notification-per-escalation-event). |
| `recipient` | object | Resolved from `recipient_user_id` (`NOT NULL`, `ON DELETE RESTRICT`). For a user anonymized under `PLAN.md` §6.2, `name`/`email` reflect the anonymized values — this endpoint reads the live `users` row, it does not preserve pre-anonymization contact details. |
| `type` | string | `escalation`. |
| `channel` | string | `email` \| `teams`. Exactly where this message went. |
| `status` | string | `pending` \| `sent` \| `failed`. `pending` and old = stuck, see above. |
| `sentAt` | string \| null | `null` while `pending` and on `failed`. |
| `readAt` | string \| null | **Best-effort only. Do not gate logic on it** (`PLAN.md` §2): meaningful for `teams` (Bot Framework read receipts), unreliable for `email` (Apple Mail Privacy Protection and Gmail image proxying fire it without a real open, and privacy-respecting clients never fire it at all). A `null` here does not mean unread and a non-`null` does not mean read. Surfaced because it has diagnostic value; never as a metric. |
| `failureReason` | string \| null | From `notifications.error_message`. **Always `null` until that column exists** — [Gap § 2](./overview.md#2-a-failed-delivery-records-no-reason). A `failed` row with a `null` reason is the current expected state, not a data error. |
| `createdAt` | string | When the ledger row was written, i.e. when the send was queued — not when it went out. |

Errors: `400` (invalid `status`/`channel`/`type` value, malformed `reviewId`), `401`, `403`.

### `GET /v1/notifications/deliveries/:id`

One delivery record, plus the thing the list can't cheaply carry: **the snippet set that actually
went out**. `notifications` stores no message body, so "what did we send?" is reconstructed by
joining `review_responses` on `(review_id, generation_group_id)` — which is precisely why
`PLAN.md` §2 added `generation_group_id` to this table, so the record pins the batch that was live
at send time instead of drifting as snippets get regenerated or edited afterward.

That reconstruction is honest about its limits and the response says so: it recovers *which*
`review_responses` rows were included and their current `content`, not a byte-exact copy of the
email. If a snippet's `content` was edited after the notification was sent, this shows the edited
text. Only `generation_group_id` is frozen; the rows it points at are not. Storing the rendered
body would be the only way to be exact, and neither `PLAN.md` nor this document proposes it —
`generation_group_id` was chosen as the deliberate middle ground.

| Field | Type | Rules |
|---|---|---|
| `id` (path) | string | required, UUID (`ParseUUIDPipe`). Must belong to the caller's `tenant_id` — a row in another tenant is `404`, never `403`. |

No request body.

Success `200`:

```json
{
  "id": "0190f3c1-2200-7c10-b4a2-5566aabbcc00",
  "reviewId": "0190f3aa-1f02-7bb1-8e30-91ab77cc2201",
  "generationGroupId": "0190f3c0-9ab1-7f44-8d21-0011223344ff",
  "recipient": {
    "id": "0190f3b2-0000-7000-8000-000000000001",
    "name": "Jane Doe",
    "email": "jane@thecoffeehouse.com"
  },
  "type": "escalation",
  "channel": "teams",
  "status": "sent",
  "sentAt": "2026-09-03T09:15:03.902Z",
  "readAt": "2026-09-03T09:41:10.000Z",
  "failureReason": null,
  "createdAt": "2026-09-03T09:15:02.109Z",
  "review": {
    "id": "0190f3aa-1f02-7bb1-8e30-91ab77cc2201",
    "rating": 1,
    "classification": "escalated",
    "escalationReason": "low_rating",
    "reviewedAt": "2026-09-03T08:58:00.000Z"
  },
  "includedSnippets": [
    {
      "id": "0190f3c0-aaaa-7000-8000-000000000001",
      "responseType": "escalation_snippet",
      "source": "ai_generated",
      "status": "superseded",
      "content": "We're sorry your visit fell short of what we aim for..."
    },
    {
      "id": "0190f3c0-aaaa-7000-8000-000000000002",
      "responseType": "escalation_snippet",
      "source": "human_edited",
      "status": "posted",
      "content": "Thank you for the feedback, Jordan — we've followed up directly..."
    }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| (all list fields) | — | Identical semantics to [`GET .../deliveries`](#get-v1notificationsdeliveries), including `readAt`'s best-effort caveat and `failureReason`'s always-`null` degradation. |
| `review` | object | Summary from `reviews`. `escalationReason` is `low_rating` \| `blocklist_match` and may be `null`; a review records only **one** escalation reason even if both applied (`PLAN.md` §8.17, accepted, not fixed). `reviewedAt` is nullable in the schema. |
| `includedSnippets` | array | `review_responses` rows matching this row's `review_id` **and** `generation_group_id`. Empty array — not `null` — when `generationGroupId` is `null`, since there is then no batch to resolve. |
| `includedSnippets[].status` | string | The snippet's **current** `response_status`, not its status at send time. `superseded` is normal and expected here (`PLAN.md` §4.2): approving one sibling snippet supersedes the others, so a notification that offered three choices will usually show one live row and two superseded ones. |

Errors: `400` (malformed UUID), `401`, `403`, `404 DELIVERY_NOT_FOUND`.

## Error reference

Every error uses the standard envelope from
[Auth § Conventions](../auth/api-reference.md#conventions). `message` values come from
`src/common/constants/messages.constants.ts`; the parenthesised code is the category string a
client branches on.

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | `GET /v1/notifications`, `GET /v1/notifications/deliveries` | A `class-validator` rule failed on the query DTO — `page`/`pageSize` below `1` or above the route's cap, non-boolean `unreadOnly`, malformed `reviewId` UUID. `message` is the comma-joined list of violations. |
| `400` | `Bad Request` (`INVALID_ENUM_VALUE`) | `GET /v1/notifications/deliveries` | `status`, `channel`, or `type` was not a member of `notification_status` / `notification_channel` / `notification_type`. Most commonly `channel=both`, which is a `notification_channel_pref` value and never valid on a delivery record — see [Overview § Enums](./overview.md#enums). |
| `400` | `Bad Request` | `PATCH /v1/notifications/:id/read`, `GET /v1/notifications/deliveries/:id` | Path `id` is not a well-formed UUID (`ParseUUIDPipe`, before the handler runs). Distinguished from `404` on purpose: a malformed id is a client bug, a well-formed unknown id is not. |
| `401` | `Unauthorized` | Every route | Missing, malformed, or expired access token. No route in this module is `@Public()`. |
| `403` | `Forbidden` | `GET /v1/notifications/deliveries`, `GET /v1/notifications/deliveries/:id` | Authenticated as a `member`, not an `owner` (`@Roles('owner')`). |
| `403` | `Forbidden` (`TENANT_SUSPENDED`) | Every route | `tenants.status = 'suspended'`. Not instant for a token already issued — `PLAN.md` §8.20, accepted. |
| `404` | `Not Found` (`NOTIFICATION_NOT_FOUND`) | `PATCH /v1/notifications/:id/read` | No `in_app_notifications` row with that id **for this user**. Returned identically whether the row does not exist or belongs to someone else — the two are deliberately indistinguishable. |
| `404` | `Not Found` (`DELIVERY_NOT_FOUND`) | `GET /v1/notifications/deliveries/:id` | No `notifications` row with that id **in this tenant**. Same non-distinguishing rule: a row in another tenant is `404`, never `403`. |
| `429` | `Too Many Requests` | Every route | `ThrottlerGuard`'s global `short` tier (30/min) exceeded. No route here sets a tighter override. |
| `500` | `Internal Server Error` | Every route | Unhandled exception. Only `traceId` is safe to show the user. |

Two errors that are conspicuously **not** in this table, because the corresponding behaviours are
successes:

- **No `409 Conflict` on re-marking a notification read.**
  [`PATCH /v1/notifications/:id/read`](#patch-v1notificationsidread) is idempotent by contract, and
  [`PATCH /v1/notifications/read-all`](#patch-v1notificationsread-all) returns
  `{ "updatedCount": 0 }` rather than erroring when nothing was unread.
- **No error for a duplicate escalation notification.** The unique-index collision described in
  [Once-only notification](#once-only-notification-per-escalation-event) happens on the pipeline's
  write path, not on any route in this document, and is handled there as a no-op. It never surfaces
  to an HTTP client because no HTTP client can trigger a send — there is no re-send endpoint, by
  design.

Failures of the underlying email/Teams transport are likewise **not** HTTP errors of this module.
They are recorded as `status = 'failed'` on a `notifications` row and read back through
[`GET /v1/notifications/deliveries`](#get-v1notificationsdeliveries); the retry and backoff policy
that decides when a send is finally abandoned belongs to the pipeline, documented in
[Review Pipeline](../review-pipeline/overview.md).
