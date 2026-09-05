---
sidebar_position: 2
---

# Reviews Module — API Reference

## How to read this document

This is the **target/spec design** for the reviews module's HTTP surface. Unlike auth, there is
no current implementation to diverge from: `apps/backend/src/api/` contains only `dev-tools`,
`health`, `metrics`, and `tracing`, and nothing review-related exists anywhere under
`apps/backend/src/` except the migrations themselves. Everything below describes what to build,
not what runs. It assumes you have read [Reviews Module — Overview](./overview.md) for the data
model, the enums, the state machine, and the one-reply-per-review invariant; this document turns
those into concrete request/response contracts rather than repeating them.

The document is intentionally **HTTP-contract-level only** — no controller, service, or
decorator code. When implementing a route below, it lives under `src/api/reviews/` per
`apps/backend/docs/conventions/module-structure.md`, with its data access in
`src/db/repositories/reviews/` (`ReviewsRepository` for the raw Drizzle queries,
`ReviewsDbService` for the multi-row transactions several of these endpoints need). The JSON
shown here is what that route's composed Swagger decorator — in
`src/api/reviews/swagger/reviews.swagger.ts`, one file for the controller, never inline
`@ApiOperation`/`@ApiResponse` on the method — should render as its example. Every success and
error `message` string comes from `src/common/constants/messages.constants.ts` (which does not
exist yet and must be created), never an inline literal.

Every route below is part of the **backend's** target surface regardless of MVP scope. Several
are not called by the shipped UI at all — dismiss, manual replies, post-status, retry-post — and
the overview's [MVP scope](./overview.md#mvp-scope) section says which. Do not drop or gate a
route here because today's frontend has no button for it.

## Conventions

- **Base path**: `/v1/reviews/...` — `@Controller({ path: RouteNames.REVIEWS, version: '1' })`.
  `RouteNames.REVIEWS = 'reviews'` must be added to `src/common/route-names.ts`; the enum has no
  reviews entry today, and a raw string in the decorator is a convention violation.
- **Auth column**: `Public` — no bearer token (`@Public()`, skips `JwtAuthGuard`). `Bearer` —
  requires `Authorization: Bearer <access_token>`, or the equivalent `sid` cookie, which
  `CookieAuthMiddleware` promotes into the header before the guards run. **Every route in this
  module is `Bearer`** — there is no public review data.
- **Tenant scoping is not optional on any query.** Both tables carry `tenant_id`; every
  statement filters on the caller's `tenant_id` from the JWT. A review belonging to another
  tenant returns `404`, never `403` — same enumeration-prevention stance as
  [../auth/api-reference.md](../auth/api-reference.md#security-considerations).
- **Token type must be checked before `tenant_id` is trusted.** Every route here requires
  `type === 'tenant_user'` (or a `support_access` token, which is read-only — see
  [Platform Admin](../platform-admin/api-reference.md#conventions)). This is not belt-and-braces:
  a `platform_admin` token carries **no** `tenantId` claim at all, so an unchecked route builds
  `WHERE tenant_id = undefined`, and in the usual Drizzle idiom
  `and(...[tenantId && eq(t.tenantId, tenantId), ...])` a falsy term is *dropped* rather than
  matching nothing — the tenant filter silently disappears and the endpoint returns every
  tenant's rows. Auth's security notes call this "the highest-severity mistake available in this
  module"; see [session/token model](../auth/api-reference.md#session--token-model-1).
- **Success and error envelopes** — identical to auth's: `TransformInterceptor`
  (`src/interceptors/transform.interceptor.ts`) wraps every 2xx in
  `{ statusCode, status, message, data }`, and `HttpExceptionFilter` plus `ErrorHandlerService`
  produce `{ statusCode, status, message, error, traceId, data: null }` for every non-2xx. The
  DTO shapes below are the **inner `data` payload** only. See
  [../auth/api-reference.md](../auth/api-reference.md#conventions) for the full envelope
  documentation, including how `class-validator` failures collapse into one comma-joined
  `message` with `error: "Validation Error"` — not restated here.
- **Pagination** — the one list endpoint returns the project-standard shape
  `{ data: [...], meta: { page, pageSize, total, totalPages } }`, query params as a single DTO
  rather than separate `@Query(...)` decorators, and `totalPages` computed in the service or DB
  service, never the controller. See `apps/backend/docs/conventions/api-patterns.md`, Pagination
  Pattern.
- **Mutations are guarded compare-and-swaps** (`PLAN.md` §8.4). Every status transition below is
  a single `UPDATE ... WHERE id = ? AND tenant_id = ? AND status = '<expected>'`; zero rows
  affected is a `409`, surfaced to the user, never a silent overwrite. Callers do not send an
  expected status — each endpoint has exactly one legal source state, listed in its section.
- **Timestamps** are ISO 8601 UTC strings in JSON, `TIMESTAMPTZ` in the database. `updated_at` is
  set explicitly by every `UPDATE`; no database trigger maintains it.

## Review queue

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/reviews` | Bearer | 30 / min |
| `GET` | `/v1/reviews/:reviewId` | Bearer | 30 / min |

### `GET /v1/reviews`

The queue listing. Returns one page of the caller's tenant's reviews, newest-reviewed first,
each with a compact summary of its live response so the client can render the computed status
badge without a second request.

The badge is the reason each row carries `latestResponse` rather than just the review's own
columns. `PLAN.md` §2 (`reviews`) is explicit that the dashboard's status is a *computed*
combination of `classification` + `status` + the latest `review_responses` row — e.g.
"Escalated · Pending Approval" — precisely so `reviews.status` never has to mirror
response-level state and drift out of sync with it. Returning the review's columns alone would
force the client to fetch N detail pages to render one list.

Filtering is server-side from the start even though `use-review-queue.ts` currently filters a
fully-loaded array client-side. `status` and `classification` map onto indexed columns
(`idx_reviews_status`, `idx_reviews_classification`); `search` is a case-insensitive match on
`reviewer_name` — matching the frontend's behaviour, which searches reviewer name only, not
review text — and has **no supporting index today**, see
[Schema prerequisites](#schema-prerequisites-not-yet-in-the-migrations). `locationId` is
accepted despite the single-location MVP: `reviews.location_id` is `NOT NULL` on every row,
`idx_reviews_location_id` already exists, and multi-location is the case `user_locations` was
reinstated for (`PLAN.md` §2).

| Query param | Type | Rules |
|---|---|---|
| `status` | enum | optional. One of `new` \| `in_review` \| `responded` \| `dismissed`. Omit for all. |
| `classification` | enum | optional. One of `auto_reply_candidate` \| `escalated` \| `pending_classification`. Omit for all. Note the frontend's `"unclassified"` is **not** a valid value here — see the overview's [MVP scope](./overview.md#mvp-scope). |
| `locationId` | uuid | optional. Must belong to the caller's tenant; a foreign one yields an empty page, not a `403`. |
| `search` | string | optional, 1–255 chars, trimmed. Case-insensitive substring match on `reviews.reviewer_name`. A row with `anonymized_at` set has a `NULL` name and can never match. |
| `page` | integer | optional, default `1`, min `1`. |
| `pageSize` | integer | optional, default `20`, min `1`, max `100`. |

Success `200`:

```json
{
  "data": [
    {
      "id": "0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22",
      "locationId": "0190f3a9-1d22-7b4c-8e11-9c2f4a7b6d03",
      "reviewerName": "Nadia Farouk",
      "rating": 4,
      "reviewText": "Lovely atmosphere and the lobster roll was great. Only knock is we waited almost 15 minutes just to get water on a Tuesday night.",
      "reviewedAt": "2026-08-30T20:05:00Z",
      "sentiment": "positive",
      "classification": "auto_reply_candidate",
      "escalationReason": null,
      "matchedKeywords": null,
      "status": "in_review",
      "anonymizedAt": null,
      "removedUpstreamAt": null,
      "responseCount": 1,
      "latestResponse": {
        "id": "0190f3b2-8a03-7c55-b2d7-6e1f0a9c4b58",
        "status": "pending_approval",
        "responseType": "auto_reply_suggestion",
        "source": "ai_generated",
        "createdAt": "2026-08-30T20:11:00Z"
      }
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 42, "totalPages": 3 }
}
```

| Response field | Type | Notes |
|---|---|---|
| `classification` | enum | Never `null` — the column is `NOT NULL DEFAULT 'pending_classification'`. |
| `escalationReason` | enum \| null | `null` unless `classification = 'escalated'`. Records only one reason even when both conditions hold (`PLAN.md` §8.17). |
| `matchedKeywords` | array \| null | Passthrough of the `jsonb` column. Populated only for `escalation_reason = 'blocklist_match'`. |
| `sentiment` | enum \| null | Informational only — never routes anything (`PLAN.md` §3). |
| `anonymizedAt` | string \| null | Non-null means `reviewerName` has been purged and reads `null` (`PLAN.md` §6). Clients render a placeholder, not an empty cell. |
| `removedUpstreamAt` | string \| null | The reviewer deleted the review on Google. Kept in the list rather than hidden, so a stale row has a visible reason. |
| `latestResponse` | object \| null | `null` when `responseCount` is `0` — a review the generation step has not reached yet. "Latest" is the highest-precedence live row: a `posted` or `approved` row if one exists (at most one can, by `idx_review_responses_review_id_live_reply`), otherwise the most recently created row. |

Errors: `400` validation (bad enum value, `pageSize` over 100), `401` missing/expired token,
`429`.

### `GET /v1/reviews/:reviewId`

One review with **every** `review_responses` row attached, including terminal ones. Rejected and
superseded rows are returned deliberately: `reply-draft-card.tsx` renders them greyed out with
their outcome copy ("Superseded — another reply was approved for this review"), and the audit
value of showing a user what happened to the sibling they did not pick is the whole point of a
terminal `superseded` state existing rather than the row being deleted.

**`status` on this route is a projection onto the four values the client understands, not the raw
`response_status`.** The Postgres enum has seven values; the frontend's `ReplyDraftStatus` union
has four (`pending_approval`, `approved`, `rejected`, `superseded`), and the shipped
`reply-draft-card.tsx` treats that union as exhaustive — its badge lookup is a
`Record<ReviewReplyDraft["status"], string>` and its label comes from
`reviewDetail.replies.status.<value>` in `en.json`, which has exactly those four keys. So emitting
a raw `posted`, `post_failed` or `draft` here yields an unstyled badge and a missing translation
key, and `draft` additionally renders as un-actionable because the card computes
`isDecided = status !== "pending_approval"`. Project on the way out:

| `response_status` | Emitted as | Why |
|---|---|---|
| `draft` | `pending_approval` | Not user-distinguishable; generation writes straight to `pending_approval` anyway (see [overview](./overview.md#review_responses-state-machine)) |
| `pending_approval` | `pending_approval` | — |
| `approved` | `approved` | Decision made; posting is an implementation detail of the same outcome |
| `posted` | `approved` | Ditto — use `postStatus` below when the client needs the delivery detail |
| `post_failed` | `approved` | Ditto; the failure surfaces through [`post-status`](#get-v1reviewsreviewidresponsesresponseidpost-status), not the badge |
| `rejected` | `rejected` | — |
| `superseded` | `superseded` | — |

The raw value stays available on the dedicated `post-status` route, which is where a client that
genuinely cares about delivery state should look. The alternative — widening the frontend union to
seven and adding three labels — is viable but changes shipped UI code; this projection does not.

Responses are ordered by `created_at`, then `id` — `id` is a `uuidv7()`, so it is
time-sortable and breaks ties in generation order rather than arbitrarily. That ordering is what
produces the `label` field: **`label` is derived, not stored.** There is no label column on
`review_responses`; the frontend's "Snippet A" / "Snippet B" is the row's position within its
`generationGroupId`, and computing it server-side keeps the letter stable across clients instead
of depending on whatever order each one happened to receive.

Success `200`:

```json
{
  "id": "0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22",
  "locationId": "0190f3a9-1d22-7b4c-8e11-9c2f4a7b6d03",
  "externalReviewId": "AbFvOqk3...",
  "reviewerName": "Marcus Doyle",
  "rating": 2,
  "reviewText": "Waited 40 minutes for a table we had booked. Nobody apologised.",
  "reviewedAt": "2026-08-31T19:20:00Z",
  "externalUpdatedAt": "2026-08-31T19:20:00Z",
  "sentiment": "negative",
  "classification": "escalated",
  "escalationReason": "low_rating",
  "matchedKeywords": null,
  "status": "in_review",
  "anonymizedAt": null,
  "removedUpstreamAt": null,
  "responses": [
    {
      "id": "0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64",
      "generationGroupId": "0190f3c1-2b30-7f88-9c12-4a7e0d3b6f51",
      "label": "A",
      "responseType": "escalation_snippet",
      "content": "Marcus, a 40-minute wait on a confirmed booking isn't acceptable and I'm sorry no one owned it in the moment. I'd like to make it right.",
      "originalContent": "Marcus, a 40-minute wait on a confirmed booking isn't acceptable and I'm sorry no one owned it in the moment. I'd like to make it right.",
      "source": "ai_generated",
      "status": "pending_approval",
      "promptId": "0190f2aa-5c31-7b09-8d44-2f6e1a0c9b73",
      "promptVersion": 3,
      "createdByUserId": null,
      "approvedByUserId": null,
      "createdAt": "2026-08-31T19:26:00Z",
      "decidedAt": null,
      "postedAt": null,
      "errorMessage": null
    },
    {
      "id": "0190f3c1-2b44-7d10-8a03-1e5c7f9b2d65",
      "generationGroupId": "0190f3c1-2b30-7f88-9c12-4a7e0d3b6f51",
      "label": "B",
      "responseType": "escalation_snippet",
      "content": "Marcus, I'm sorry — a booked table should never mean a 40-minute wait. Please get in touch so we can put this right.",
      "originalContent": "Marcus, I'm sorry — a booked table should never mean a 40-minute wait. Please get in touch so we can put this right.",
      "source": "ai_generated",
      "status": "pending_approval",
      "promptId": "0190f2aa-5c31-7b09-8d44-2f6e1a0c9b73",
      "promptVersion": 3,
      "createdByUserId": null,
      "approvedByUserId": null,
      "createdAt": "2026-08-31T19:26:00Z",
      "decidedAt": null,
      "postedAt": null,
      "errorMessage": null
    }
  ]
}
```

`content` equals `originalContent` on both rows above, and on a `pending_approval` row it always
will: there is no save-draft endpoint in this module, so an owner's in-progress edit lives only
in the browser's textarea until they approve. `content` and `source` diverge from
`originalContent` and `ai_generated` at exactly one moment — the approve call — which is what
makes that single write the authoritative record of whether a human changed the AI's wording.

| Response field | Type | Notes |
|---|---|---|
| `externalUpdatedAt` | string \| null | Google's own last-modified timestamp. Load-bearing, not metadata: the poller diffs it every cycle to detect an upstream edit and supersede pending drafts (`PLAN.md` §8.6). Exposed so a client can tell a user their draft went stale because the review changed. |
| `label` | string | Derived from position within `generationGroupId` (`A`, `B`, `C`). Not a column. `null`-group rows — a lone auto-reply suggestion, a manual reply — get `"A"`. |
| `originalContent` | string \| null | The AI text before any human edit (`0006_prompts.sql`). `null` for `human_manual` and `imported` rows, which never had an AI draft. |
| `promptId` / `promptVersion` | uuid / integer | Resolved by joining `review_responses.prompt_version_id` → `prompt_versions` → `prompts`. Both `null` when `prompt_version_id` is `null` (`human_manual`, `imported`, or a row whose prompt version was deleted — the FK is `ON DELETE SET NULL`). See [../prompts/api-reference.md](../prompts/api-reference.md). |
| `decidedAt` | string \| null | Set when the row's status became terminal — approved, rejected, or superseded. Half of the average-time-to-decision figure in `prompt-analytics.ts`. |
| `postedAt` / `errorMessage` | string \| null | Post-back outcome; see [Post-back status](#post-back-status). |
| `generationMetadata` | — | **Deliberately not returned.** The `jsonb` column holds model name, region, and token counts for server-side debugging (`PLAN.md` §5, step 5); it is not user-facing and should not be shipped to a browser. Analytics reads `promptVersionId` instead — see the overview's [Prompt-analytics linkage](./overview.md#prompt-analytics-linkage). |

Errors: `404 REVIEW_NOT_FOUND` (unknown id, or a review belonging to another tenant), `401`,
`429`.

## Response approval

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/reviews/:reviewId/responses/:responseId/approve` | Bearer | 30 / min |
| `POST` | `/v1/reviews/:reviewId/responses/:responseId/reject` | Bearer | 30 / min |
| `POST` | `/v1/reviews/:reviewId/responses/:responseId/retry-post` | Bearer | 10 / min |

### `POST /v1/reviews/:reviewId/responses/:responseId/approve`

The module's central action, and the one with the most invariants to hold at once. It performs
five things in **one transaction**:

1. A guarded compare-and-swap on the target row:
   `UPDATE review_responses SET status = 'approved', ... WHERE id = ? AND tenant_id = ? AND
   review_id = ? AND status = 'pending_approval'`. The `review_id` term is not redundant — without
   it, pairing this review's `:reviewId` with another review's `:responseId` actions the wrong
   row, which is what `404 RESPONSE_NOT_FOUND` in the [error reference](#error-reference) promises
   to prevent. Zero rows affected → `409 RESPONSE_ALREADY_ACTIONED`
   (`PLAN.md` §8.4). There is deliberately no `expectedStatus` request field: `pending_approval`
   is the only legal source state for this transition, so the guard is server-fixed rather than
   client-supplied.
2. Writes `approved_by_user_id` from the authenticated user — taken from the JWT, never from the
   request body, so it cannot be spoofed — and `decided_at = now()`.
3. Applies the edit, if any, and sets `source` accordingly. This is the **only** place
   `ai_generated` becomes `human_edited`.
4. Supersedes every sibling: `UPDATE review_responses SET status = 'superseded',
   decided_at = now() WHERE review_id = ? AND tenant_id = ? AND id <> ? AND status IN ('draft',
   'pending_approval')`. Scoped by `review_id`, not `generation_group_id` — the invariant is one
   reply per *review*, so a stale draft from an earlier batch must be swept too.
   **The `tenant_id` term is load-bearing, not decoration.** `review_id` arrives from the path, so
   without it a caller in tenant A can pass tenant B's `reviewId` alongside their own
   `responseId`: step 1 passes on their own row, and this statement then terminally supersedes
   every pending draft on tenant B's review — their escalation snippets vanish from the queue and
   the review is never answered. Every statement in this transaction carries `tenant_id`, per
   [Conventions](#conventions); this is the one where omitting it is a cross-tenant write rather
   than a cross-tenant read.
5. Enqueues the post-back job. The transaction does not call Google.

Step 3 is what the `response_source` enum's `ai_generated` / `human_edited` split exists for, and
the comparison must be against `original_content`, not against whatever the client claims was
there before: if `content` is present and its trimmed value differs from the trimmed
`original_content`, the row becomes `source = 'human_edited'` and `content` is overwritten;
otherwise `source` is left alone. Because `original_content` was added by `0006_prompts.sql` and
is nullable, a row generated before that migration has no baseline — for those, set
`original_content` to the pre-edit `content` in the same statement. `prompt-analytics.ts`'s
approved-as-is-vs-edited split is exactly `content.trim() !== originalContent.trim()` over
`approved` rows, so a missing baseline silently reports every approval as "as-is."

Step 5 is deliberately outside the state change. `approved → posted` needs a live single-review
freshness check against Google immediately before the write (`PLAN.md` §8.12) — Google's reply
endpoint is an unconditional upsert with no existence check, so posting without it can silently
overwrite a reply the owner wrote by hand — and that check is a network call, which belongs in
neither a transaction nor a request handler. The response below therefore returns `approved`,
not `posted`; the frontend's confirmation copy is already future-tense and matches.

If two staff members approve different siblings at genuinely the same instant, one transaction
loses on `idx_review_responses_review_id_live_reply`
(`UNIQUE (review_id) WHERE status IN ('approved', 'posted')`). That unique violation must be
translated into `409 REVIEW_ALREADY_HAS_LIVE_REPLY`, not allowed to surface as a `500`
(`PLAN.md` §8.5). Treating it as the module's expected concurrency outcome — rather than an
unexpected database error — is the difference between the second user seeing "someone else
already approved a reply for this review" and seeing a crash.

Request:

```json
{
  "content": "Marcus, a 40-minute wait on a confirmed booking isn't acceptable and I'm sorry no one owned it in the moment. I'd like to make it right — please email me directly."
}
```

| Field | Type | Rules |
|---|---|---|
| `content` | string | optional, 1–4096 chars, trimmed, non-empty after trimming. Omit to approve the AI draft unchanged. Present and identical to `original_content` → treated as unchanged (`source` stays `ai_generated`); present and different → `source` becomes `human_edited`. `reply-draft-card.tsx` always submits the textarea's current value, so the equal-value case is the normal path, not an edge case. |

Success `200`:

```json
{
  "id": "0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64",
  "reviewId": "0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22",
  "status": "approved",
  "source": "human_edited",
  "approvedByUserId": "0190f2b7-9d12-7e34-b501-8c3a5f7d2e19",
  "decidedAt": "2026-08-31T20:02:11Z",
  "postedAt": null,
  "supersededResponseIds": ["0190f3c1-2b44-7d10-8a03-1e5c7f9b2d65"],
  "reviewStatus": "in_review"
}
```

`supersededResponseIds` is returned so the client can reconcile its local state in one round
trip rather than re-fetching the detail page — the frontend already performs exactly this
supersede sweep optimistically in `use-review-detail.ts`, and returning the authoritative list
lets it correct itself if the server superseded a row it did not know about. `reviewStatus` stays
`in_review` here on purpose: it only becomes `responded` once a response actually reaches
`posted`.

**Approve must also re-check the parent review inside the same transaction.** Its own CAS guards
the *response*; nothing in it looks at `reviews.status`, and dismiss's supersede sweep only touches
`('draft','pending_approval')` — so two users in two tabs can dismiss and approve the same review
and both succeed, leaving a `dismissed` review with a reply on its way to Google and
`reviews.status` ending up `responded`. `PLAN.md` §8.4 covers two staff on one *response*; nothing
in §8 covers two staff on one *review* through different endpoints. Add
`AND reviews.status NOT IN ('dismissed','responded')` to the transaction and return
`409 REVIEW_ALREADY_DISMISSED` — the code
[`POST /v1/reviews/:reviewId/responses`](#post-v1reviewsreviewidresponses) already defines for the
same situation.

> **Open product decision — precedence.** Requiring the check is not in question; which action
> wins is. Either dismiss is final (approve then 409s, and dismiss must additionally refuse when a
> live `approved`/`posted` reply already exists) or approve is (dismiss 409s once a reply is
> live). Pick one explicitly — the two endpoints currently assume opposite answers.

Errors: `400` validation (empty or over-length `content`), `404 REVIEW_NOT_FOUND`,
`404 RESPONSE_NOT_FOUND`, `409 RESPONSE_ALREADY_ACTIONED`,
`409 REVIEW_ALREADY_HAS_LIVE_REPLY`, `409 REVIEW_ALREADY_DISMISSED`,
`409 REVIEW_REMOVED_UPSTREAM`, `401`, `429`.

### `POST /v1/reviews/:reviewId/responses/:responseId/reject`

Rejects one response. Narrower than approve in the one way that matters: **it does not touch
siblings.** Rejecting snippet A leaves snippet B at `pending_approval`, because the user's
intent is "not this wording," not "no reply for this review" — that second intent is
[dismiss](#post-v1reviewsreviewiddismiss). The frontend matches: `rejectDraft` in
`use-review-detail.ts` maps only the target draft and leaves every other one alone, in explicit
contrast to `approveDraft`.

Guarded compare-and-swap on `status = 'pending_approval'` → `'rejected'`, plus
`decided_at = now()`. No request body. `rejected` is terminal — there is no un-reject; a user who
changes their mind writes a manual reply instead.

Success `200`:

```json
{
  "id": "0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64",
  "reviewId": "0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22",
  "status": "rejected",
  "decidedAt": "2026-08-31T20:04:47Z",
  "reviewStatus": "in_review"
}
```

Note what this response cannot include: **there is no `rejected_by_user_id` column.**
`review_responses` has `created_by_user_id` and `approved_by_user_id` only, so a rejection's
author is recoverable from `audit_logs` (via the `log_db_changes()` trigger) but not from the
operational tables — see
[Schema prerequisites](#schema-prerequisites-not-yet-in-the-migrations).

Errors: `404 REVIEW_NOT_FOUND`, `404 RESPONSE_NOT_FOUND`, `409 RESPONSE_ALREADY_ACTIONED`,
`401`, `429`.

### `POST /v1/reviews/:reviewId/responses/:responseId/retry-post`

The `post_failed → approved` arrow in `PLAN.md` §4.2. Posting to Google can fail on a rate limit,
an expired token, or a content-policy rejection; `error_message` and the `post_failed` status
exist specifically so that surfaces in the UI with a retry path rather than stranding an approved
reply (`PLAN.md` §2, `review_responses`).

Guarded compare-and-swap on `status = 'post_failed'` → `'approved'`, clearing `error_message`,
then re-enqueuing the same post-back job — including its freshness check, which is the whole
point of re-running it rather than retrying the raw API call: by the time someone clicks retry,
the review may well have been answered another way.

`post_failed` is inside the live-reply partial unique index's scope on neither side — the index
covers `('approved', 'posted')` only — so a `post_failed` row does not block another sibling from
being approved. That is a real ordering hazard worth stating: if a user approves a different
snippet while an earlier one sits at `post_failed`, this retry will then lose on the unique index
and return `409 REVIEW_ALREADY_HAS_LIVE_REPLY`. Correct outcome, non-obvious cause.

No request body.

Success `200`:

```json
{
  "id": "0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64",
  "status": "approved",
  "errorMessage": null,
  "retryQueuedAt": "2026-08-31T21:15:03Z"
}
```

Errors: `404 REVIEW_NOT_FOUND`, `404 RESPONSE_NOT_FOUND`, `409 RESPONSE_NOT_RETRYABLE` (the row
is not at `post_failed`), `409 REVIEW_ALREADY_HAS_LIVE_REPLY`, `401`, `429`.

## Manual replies

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/reviews/:reviewId/responses` | Bearer | 20 / min |

### `POST /v1/reviews/:reviewId/responses`

Writes a reply from scratch instead of approving a generated one — the `human_manual` value of
`response_source`. Backend-target only: the shipped UI has no composer, and `ReviewReplyDraft`
in `apps/web/src/types/domain.ts` models AI drafts exclusively. It is specified because a review
whose every snippet was rejected otherwise has no path to a reply at all, and because
`PLAN.md` §5's few-shot example set explicitly draws on `human_manual` rows alongside the other
three sources — the system is designed to learn from replies people wrote themselves.

Inserts a new row at `status = 'approved'` (not `pending_approval` — the author is the approver,
and a self-approval step would be theatre), with `source = 'human_manual'`,
`created_by_user_id` **and** `approved_by_user_id` both set to the calling user,
`decided_at = now()`, and `original_content` / `prompt_version_id` / `generation_group_id` all
`NULL`. It then supersedes non-terminal siblings and enqueues the post exactly as
[approve](#post-v1reviewsreviewidresponsesresponseidapprove) does — same transaction, same
sweep, same unique-index backstop.

`response_type` is `NOT NULL` with no "manual" value available, so it is derived server-side
from the review — `escalation_snippet` when `classification = 'escalated'`,
`auto_reply_suggestion` otherwise — and never accepted from the client: it records *why a reply
exists*, a property of the review, not of who typed the text.

Request:

```json
{
  "content": "Marcus, I've read this and I'm sorry. I'm the owner — please email me at hello@example.com and I'll sort this out personally."
}
```

| Field | Type | Rules |
|---|---|---|
| `content` | string | required, 1–4096 chars, trimmed, non-empty after trimming. |

Success `201`:

```json
{
  "id": "0190f3d4-6e01-7a92-b7c3-0f2a8d5b1e46",
  "reviewId": "0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22",
  "responseType": "escalation_snippet",
  "source": "human_manual",
  "status": "approved",
  "createdByUserId": "0190f2b7-9d12-7e34-b501-8c3a5f7d2e19",
  "approvedByUserId": "0190f2b7-9d12-7e34-b501-8c3a5f7d2e19",
  "decidedAt": "2026-08-31T20:31:09Z",
  "supersededResponseIds": ["0190f3c1-2b44-7d10-8a03-1e5c7f9b2d65"],
  "reviewStatus": "in_review"
}
```

Errors: `400` validation, `404 REVIEW_NOT_FOUND`, `409 REVIEW_ALREADY_HAS_LIVE_REPLY` (a reply is
already approved or posted for this review), `409 REVIEW_ALREADY_DISMISSED`,
`409 REVIEW_REMOVED_UPSTREAM`, `401`, `429`.

## Review triage

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `POST` | `/v1/reviews/:reviewId/dismiss` | Bearer | 20 / min |

### `POST /v1/reviews/:reviewId/dismiss`

The one terminal outcome that posts nothing: "this review needs no reply." A five-star review
with no text, spam, a review left on the wrong business. `review_status.dismissed` exists for it.

Backend-target only, and the asymmetry is worth naming: `dismissed` is offered as a **filter
value** in the queue's status dropdown (`STATUS_VALUES` in `review-filters-bar.tsx` lists all
four `review_status` values) while no UI action anywhere sets it. The shipped app can filter by a
status it cannot produce. The endpoint closes that gap from the backend side.

Guarded compare-and-swap on the *review*, not a response:
`UPDATE reviews SET status = 'dismissed', updated_at = now() WHERE id = ? AND tenant_id = ? AND
status IN ('new', 'in_review')`. `responded` is excluded because a review with a posted reply
cannot be un-replied, and `dismissed` is excluded so a double-click is an idempotency question
rather than a silent no-op — zero rows affected returns `409 REVIEW_NOT_DISMISSIBLE` and the
message distinguishes the two causes.

Dismissing also supersedes every non-terminal response for the review (`draft`,
`pending_approval`), in the same transaction. Leaving them live would contradict the review's own
terminal state and, worse, leave rows that `idx_review_responses_review_id_live_reply` would
happily let someone approve afterwards.

The `new` case races the classify-and-generate worker, which claims rows with
`WHERE id = ? AND status = 'new'` (`PLAN.md` §8.3). Whichever compare-and-swap lands first wins,
cleanly in both directions: if dismiss wins, the worker skips the review and never drafts for
it; if the worker wins, the review is `in_review` and this endpoint's second source state still
accepts it.

No request body.

Success `200`:

```json
{
  "id": "0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22",
  "status": "dismissed",
  "supersededResponseIds": [],
  "updatedAt": "2026-08-31T20:44:52Z"
}
```

As with reject, there is **no `dismissed_by_user_id` or `dismissed_at` column** on `reviews` —
only `audit_logs` records who dismissed what. See
[Schema prerequisites](#schema-prerequisites-not-yet-in-the-migrations).

Errors: `404 REVIEW_NOT_FOUND`, `409 REVIEW_NOT_DISMISSIBLE` (already `responded` or already
`dismissed`), `401`, `429`.

## Post-back status

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/reviews/:reviewId/responses/:responseId/post-status` | Bearer | 60 / min |

### `GET /v1/reviews/:reviewId/responses/:responseId/post-status`

Reads the outcome of the asynchronous post-back for one response. Because
[approve](#post-v1reviewsreviewidresponsesresponseidapprove) returns at `approved` and the actual
Google call happens on a worker, a client that wants to show "posted" rather than "will post"
needs somewhere to look. It is separate from the detail endpoint — which returns the same three
fields inline — on purpose: polling `GET /v1/reviews/:reviewId` every two seconds to watch one
field would re-read every response row for the review, and this endpoint's throttle tier is
deliberately looser to make short-interval polling legitimate.

No frontend consumer exists today. `ReplyDraftStatus` in `apps/web/src/types/domain.ts` is
`pending_approval | approved | rejected | superseded` — no `posted` or `post_failed` member at
all, and the approval confirmation copy stops at "will post to Google Business Profile." The
backend still records the outcome, and `PLAN.md` §2 requires the retry path, so the data exists
whether or not the UI reads it yet.

Success `200`:

```json
{
  "id": "0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64",
  "reviewId": "0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22",
  "status": "post_failed",
  "postedAt": null,
  "errorMessage": "Google API returned 429 (quota exceeded) — retry scheduled",
  "reviewStatus": "in_review"
}
```

| Response field | Type | Notes |
|---|---|---|
| `status` | enum | Any `response_status` value. `approved` = queued, not yet attempted. `posted` = live on Google. `post_failed` = attempted and failed, retryable. `superseded` = the freshness check found an existing reply and aborted the post (`PLAN.md` §8.12), so this response was never sent. |
| `postedAt` | string \| null | Non-null only for `posted`. For an `imported` row this is Google's `reviewReply.updateTime`, not our own write time (`PLAN.md` §7). |
| `errorMessage` | string \| null | Populated on `post_failed`. Provider-derived text — safe to show, but never the only diagnostic; the `traceId` on the failing worker's log line is. |
| `reviewStatus` | enum | The parent review's `review_status`, which becomes `responded` only once a response reaches `posted`. Included so a client polling this endpoint does not need a second request to update the queue badge. |

A `superseded` reply to this endpoint is the one that needs explaining to a user, and the message
must say *why*: the review was already answered externally, their approval did not go through,
and nothing was overwritten. `PLAN.md` §8.12 is explicit that silently overwriting an owner's own
manual reply is a materially worse outcome than a failed action, which makes this endpoint's
`superseded` case a success path for the system and a failure path for the user's intent.

Errors: `404 REVIEW_NOT_FOUND`, `404 RESPONSE_NOT_FOUND`, `401`, `429`.

## Schema prerequisites not yet in the migrations

Four things this module needs are absent from the SQL, called out here rather than silently
assumed — the same way [../auth/api-reference.md](../auth/api-reference.md#configuration) flags
its missing `refresh_tokens` table.

**1. `0006_prompts.sql` has not been applied, and nothing in the InnoPeak schema has been
introspected.** The journal (`src/db/drizzle/migrations/meta/_journal.json`) has an entry for
`0006_prompts` at `idx: 6`, so `pnpm db:migrate` will pick it up — but
`src/db/drizzle/schema.ts` is still the generic boilerplate's introspected output (`users`,
`roles`, `permissions`, `refresh_tokens`, `api_keys`, `media`, `webhooks`, …) and contains
**none** of the InnoPeak tables. There is no `reviews` and no `reviewResponses` Drizzle table to
query. `prompt_version_id`, `original_content`, and `decided_at` — the three columns every
prompt-analytics figure depends on — exist only as un-run `ALTER TABLE` statements.
Run `pnpm db:migrate` then `pnpm db:introspect` before writing repository code.

**2. No attribution column for a rejection or a dismissal.** `review_responses` has
`created_by_user_id` and `approved_by_user_id`; there is no `rejected_by_user_id`, and `reviews`
has no `dismissed_by_user_id` / `dismissed_at`. Both actions are recoverable from `audit_logs`
via the `log_db_changes()` trigger, but not from the operational tables — so "who dismissed
this?" is a JSON scan, not a join. `PLAN.md` §6.2 argues at length that losing the
who-approved-this trail would be worse than the GDPR gap it was discussing, precisely because
human approval is this system's core safety mechanism; the same argument applies with slightly
less force to the negative decisions. **Required follow-up migration** if rejection/dismissal
attribution needs to be queryable: add `rejected_by_user_id UUID REFERENCES users(id) ON DELETE
SET NULL` to `review_responses`, and `dismissed_by_user_id` / `dismissed_at` to `reviews`.

**3. `PLAN.md` §2 recommends `review_responses.approved_at` and it was never added.**
`0004_reviews.sql` created `approved_by_user_id` but no `approved_at`; the closest column is
`decided_at`, added later by `0006_prompts.sql`, which covers *any* terminal transition —
approved, rejected, or superseded. That is adequate for `prompt-analytics.ts`'s time-to-decision
figure, which does not care which decision was made, but it means "when was this approved?" is
only answerable by reading `decided_at` **together with** `status = 'approved'`. Treated here as
a deliberate substitution rather than a missing column — a real follow-up only if approval time
ever needs distinguishing from rejection time on the same row.

**4. No index supports the `search` filter.** `GET /v1/reviews`'s `search` param matches
`reviews.reviewer_name` case-insensitively, and the seven indexes on `reviews`
(`idx_reviews_tenant_id`, `_location_id`, the unique `_location_id_external_review_id`,
`_status`, `_classification`, `_reviewed_at`, `_external_reviewer_id`) include nothing on
`reviewer_name`. An `ILIKE '%term%'` is a sequential scan over the tenant's reviews. Tolerable at
MVP volume behind the `tenant_id` filter, but the fix is a **follow-up migration** adding a
`pg_trgm` GIN index:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_reviews_reviewer_name_trgm ON reviews USING gin (reviewer_name gin_trgm_ops);
```

Related, and cheaper: the list endpoint's default sort is `reviewed_at DESC` within one
`tenant_id`, and `idx_reviews_reviewed_at` is a single-column index with no `tenant_id` leading
column. A composite `(tenant_id, reviewed_at DESC)` index would serve the queue's default page
directly. Worth measuring before adding — noted so it is a decision rather than an oversight.

## Error reference

Every error uses the shared envelope described in [Conventions](#conventions). `message` values
are exact strings from `src/common/constants/messages.constants.ts`; `error` is the category
string the frontend branches on.

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | Any route with a body or query params | A `class-validator` rule failed — bad enum value, `pageSize` over 100, empty or over-4096-char `content`. `message` is the comma-joined list of violations. |
| `401` | `Unauthorized` | Every route | Missing, malformed, or expired access token. Every route in this module is `Bearer`. |
| `403` | `Forbidden` (`TENANT_SUSPENDED`) | Every route | `tenants.status = 'suspended'`. Not instant for a token already issued — see `PLAN.md` §8.20. |
| `404` | `Not Found` (`REVIEW_NOT_FOUND`) | Every route with `:reviewId` | Unknown id, **or** a review belonging to another tenant. Deliberately not `403` — a `403` would confirm the review exists. |
| `404` | `Not Found` (`RESPONSE_NOT_FOUND`) | approve, reject, retry-post, post-status | Unknown `:responseId`, or one whose `review_id` is not the `:reviewId` in the path. Mismatched-parent is a `404`, not a `400`: the response does not exist *at that path*. |
| `409` | `Conflict` (`RESPONSE_ALREADY_ACTIONED`) | approve, reject | The guarded compare-and-swap affected zero rows — the response was no longer at `pending_approval` (another user approved, rejected, or a sibling's approval superseded it). `PLAN.md` §8.4. |
| `409` | `Conflict` (`REVIEW_ALREADY_HAS_LIVE_REPLY`) | approve, manual reply, retry-post | `idx_review_responses_review_id_live_reply` unique violation — a row for this review is already `approved` or `posted`. The constraint-level backstop for two simultaneous sibling approvals, translated into a clean conflict rather than a `500`. `PLAN.md` §8.5. |
| `409` | `Conflict` (`RESPONSE_NOT_RETRYABLE`) | retry-post | The response is not at `post_failed`. |
| `409` | `Conflict` (`REVIEW_NOT_DISMISSIBLE`) | dismiss | `reviews.status` is already `responded` or `dismissed`. |
| `409` | `Conflict` (`REVIEW_ALREADY_DISMISSED`) | manual reply | Cannot reply to a dismissed review. Reported separately from `REVIEW_NOT_DISMISSIBLE` because the remedy differs — undismissing is not an operation this module offers. |
| `409` | `Conflict` (`REVIEW_REMOVED_UPSTREAM`) | approve, manual reply | `reviews.removed_upstream_at` is set — the reviewer deleted the review on Google, so there is nothing left to reply to. Read routes still return the row; write routes refuse it. |
| `429` | `Too Many Requests` | Any route | `ThrottlerGuard` limit for that route's tier — see the per-group throttle columns above. Post-status is deliberately looser to make polling legitimate. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. Only `traceId` is safe to show a user. A unique-violation on `idx_review_responses_review_id_live_reply` reaching this row means the translation in `409 REVIEW_ALREADY_HAS_LIVE_REPLY` is missing — treat any `500` from an approve as a bug in that mapping first. |

Two errors this module deliberately does **not** define:

- **No `422` for a stale client read.** Every stale-read case is a `409`, because the client's
  recovery is identical in all of them: re-fetch the review and show the user what actually
  happened. Two status codes would imply a difference in handling that does not exist.
- **No error for approving a response on a review someone answered externally.** The approve call
  succeeds and returns `approved`; the freshness check runs later, on the worker, and surfaces as
  `superseded` through [post-status](#get-v1reviewsreviewidresponsesresponseidpost-status).
  Making approve verify against Google synchronously would put a third-party network call inside
  a request handler and a transaction — `PLAN.md` §8.12 places that check immediately before the
  post, a different moment from immediately before the approval.
