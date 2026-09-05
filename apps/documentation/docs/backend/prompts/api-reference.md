---
sidebar_position: 2
---

# Prompts Module — API Reference

## How to read this document

This is the **target/spec design** for the prompts module's HTTP surface. None of it exists —
there is no `src/api/prompts/`, no prompts repository, and `0006_prompts.sql` has not been applied
or introspected (see [Gap](./overview.md#gap-between-current-code-and-target-design)). Nothing
below describes current behaviour; it describes the contract to build against.

It assumes you have read [Prompts Module — Overview](./overview.md) for the data model, the
append-only versioning rationale, and the per-owner tone model. Those narratives are not repeated
here — this document turns them into request/response contracts.

Contract level only: no controller or decorator code. When implementing a route, it lives under
`src/api/prompts/` per `apps/backend/docs/conventions/module-structure.md`. The JSON shown here is
what that route's composer in `swagger/prompts.swagger.ts` should render as its example; every
`message` string — success and error alike — comes from `src/common/constants/messages.constants.ts`
under a `PROMPTS` key, never an inline literal. That file does not exist yet; this module creates
it.

Where a number, column, or enum value is named below, it is verified against
`apps/backend/src/db/drizzle/migrations/0006_prompts.sql` (for this module's own tables) and
`0000_foundation.sql` / `0004_reviews.sql` (for `review_responses` and its enums). Where something
the contract needs is **missing** from the schema, it is flagged inline as a required follow-up
migration rather than silently assumed.

## Conventions

- **Base path**: `/v1/prompts/...` — `RouteNames.PROMPTS`, `version: '1'` in `@Controller()`.
  That enum entry does not exist in `src/common/route-names.ts` yet and must be added; controller
  paths never use a raw string.
- **Auth column**: every route is `Bearer, owner` — a valid access token
  (`Authorization: Bearer <token>`, or the `sid` cookie which `CookieAuthMiddleware` promotes)
  **and** `@Roles('owner')`. Reply prompts live behind Settings, which `PLAN.md` §2 restricts to
  `owner`; a `member` gets `403`.
- **Token type must be checked before `tenant_id` is trusted.** Every route here requires
  `type === 'tenant_user'` (or a `support_access` token, which is read-only — see
  [Platform Admin](../platform-admin/api-reference.md#conventions)). This is not belt-and-braces:
  a `platform_admin` token carries **no** `tenantId` claim at all, so an unchecked route builds
  `WHERE tenant_id = undefined`, and in the usual Drizzle idiom
  `and(...[tenantId && eq(t.tenantId, tenantId), ...])` a falsy term is *dropped* rather than
  matching nothing — the tenant filter silently disappears and the endpoint returns every
  tenant's rows. Auth's security notes call this "the highest-severity mistake available in this
  module"; see [session/token model](../auth/api-reference.md#session--token-model-1).
- **Throttle**: the global `short` tier (30/min) unless a route says otherwise.
- **Envelopes**: success payloads shown below are the *inner* `data`; the wire body is wrapped by
  `TransformInterceptor` into `ApiResponse<T>` (`src/common/dto/api-response.ts`). Errors are
  uniformly shaped by `HttpExceptionFilter` + `ErrorHandlerService` with `statusCode`, `status`,
  `message`, `error`, `traceId`, `data: null`.
- **Timestamps** are ISO 8601 UTC strings. **Ids** are `uuidv7()` values, so string-sortable by
  creation time.
- The full envelope shapes, `traceId` semantics, and validation-error collapsing are documented
  once in [Auth Module — API Reference §
  Conventions](../auth/api-reference.md#conventions) — read that rather than a second copy here.

## Prompt catalogue

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/prompts` | Bearer, `owner` | 30 / min |
| `GET` | `/v1/prompts/:promptId` | Bearer, `owner` | 30 / min |

A tenant has exactly three prompts, one per `prompt_category` value, enforced by the unique
`idx_prompts_tenant_id_category`. There is no create or delete route — see the overview's
[API surface](./overview.md#api-surface) for why, and gap 2 in the
[Gap](./overview.md#schema-gaps--required-follow-up-migrations) section for where the three rows
have to come from instead (the signup transaction of `PLAN.md` §8.10, which predates these tables
and does not currently create them).

### `GET /v1/prompts`

The Settings → Prompts screen's single load call. Returns every prompt for the caller's tenant,
each with its **current** version resolved (`ORDER BY version DESC LIMIT 1` over
`prompt_versions`, index-only via `idx_prompt_versions_prompt_id_version` — there is no
`current_version_id` pointer column, deliberately), the calling owner's resolved tone, and the
per-owner tone rows.

`includeHistory=true` embeds the full `prompt_versions` array per prompt, matching the frontend's
`AiPrompt.versions` shape so the Settings screen can render its collapsible history without a
second round trip. That is safe at MVP volumes (three prompts, a handful of edits) and is why the
paginated [history endpoint](#get-v1promptspromptidversions) exists as the shape that scales
rather than as the only option.

`createdBy` is resolved by joining `prompt_versions.created_by_user_id` → `users.name`. That FK is
`ON DELETE SET NULL`, and `PLAN.md` §6.2's staff-erasure design nulls `users.name` in place rather
than deleting the row — so both a null FK and a null name are expected states, and both render as
`null` here for the client to label ("Deleted user" is UI copy, not an API value).

| Query param | Type | Rules |
|---|---|---|
| `includeHistory` | boolean | optional, default `false`. Embeds every version per prompt. Example: `true` |

Success `200`:

```json
{
  "prompts": [
    {
      "id": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0011",
      "category": "positive",
      "name": "Positive review reply",
      "description": "Used for 4-5 star reviews. Keep it warm and specific to what the reviewer praised.",
      "currentVersion": {
        "id": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0aa1",
        "version": 3,
        "template": "You are replying on behalf of {{business_name}} to a {{rating}}-star review.\n\nReview: \"{{review_text}}\"\n\nWrite a warm, genuine thank-you reply. Do not repeat the reviewer's name. Keep it under 60 words.",
        "createdAt": "2026-08-25T09:30:00.000Z",
        "createdBy": { "userId": "0190f3b2-1c44-7a10-8f31-2b7c9e5d0002", "name": "Jane Doe" }
      },
      "tone": "friendly",
      "versionCount": 3,
      "createdAt": "2026-08-20T10:00:00.000Z",
      "updatedAt": "2026-08-20T10:00:00.000Z"
    }
  ]
}
```

| Field | Type | Rules |
|---|---|---|
| `prompts[].id` | string (uuid) | `prompts.id` |
| `prompts[].category` | enum | `prompts.category` — `positive` \| `neutral` \| `escalated` |
| `prompts[].name` | string | `prompts.name`, `VARCHAR(255) NOT NULL` |
| `prompts[].description` | string | `prompts.description` is nullable `VARCHAR(500)`; coalesced to `""` because the frontend's `AiPrompt.description` is non-optional |
| `prompts[].currentVersion` | object | Highest-`version` `prompt_versions` row. Never null — `prompt_versions.template` is `NOT NULL` and a prompt is provisioned with v1, so a prompt with zero versions is a data-integrity fault, not an empty state |
| `prompts[].currentVersion.version` | integer | `prompt_versions.version`, `CHECK (version > 0)` |
| `prompts[].currentVersion.createdAt` | string (ISO) | `prompt_versions.created_at`. Maps to the frontend's `PromptVersion.updatedAt` — the table has no `updated_at`, because a version row is never updated |
| `prompts[].currentVersion.createdBy` | object \| null | Join on `created_by_user_id`; `null` when the FK is null or `users.name` was anonymized |
| `prompts[].tone` | enum | `prompts.tone` directly — `NOT NULL DEFAULT 'professional'`, so this is never missing and never needs a fallback on either side of the wire |
| `prompts[].versionCount` | integer | `count(*)` over `prompt_versions` for this prompt |
| `prompts[].versions` | array | Present only when `includeHistory=true`; same entry shape as `currentVersion`, ordered oldest → newest to match `AiPrompt.versions` |

Errors: `401`, `403`, `429`, `500`.

### `GET /v1/prompts/:promptId`

One prompt, identical entry shape to a `GET /v1/prompts` element. Not used by the frontend today
(the Settings screen holds all three prompts in state) — documented because every write route
returns a prompt-shaped payload and a client needs a way to re-read one without re-listing.

Scoped by `tenant_id` on the lookup, not after it: a `promptId` belonging to another tenant
returns `404 PROMPT_NOT_FOUND`, not `403`, so the response cannot be used to confirm that some
other tenant's prompt exists.

| Field | Type | Rules |
|---|---|---|
| `promptId` | string (uuid) | path param, required, must be a UUID and belong to the caller's tenant |

Success `200`: a single `prompt` object, exactly as in the list above.

Errors: `400` validation (malformed UUID), `401`, `403`, `404 PROMPT_NOT_FOUND`, `429`, `500`.

## Versions

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/prompts/:promptId/versions` | Bearer, `owner` | 30 / min |
| `POST` | `/v1/prompts/:promptId/versions` | Bearer, `owner` | 10 / min |

`prompt_versions` is append-only: the table has no `updated_at` and nothing in this module ever
issues an `UPDATE` or `DELETE` against it. There is consequently **no `PUT /v1/prompts/:promptId`
that mutates a template** and no restore route — rolling back means appending the old text as a
new version, so the rollback is itself dated, attributed, and separately measurable. See
[Editing a prompt appends a version](./overview.md#editing-a-prompt-appends-a-version).

### `GET /v1/prompts/:promptId/versions`

Full history, **newest first**, paginated. This is the endpoint that scales past what
`GET /v1/prompts?includeHistory=true` can reasonably embed; the frontend's history panel
(`prompt-version-history.tsx`) is explicitly read-only, so nothing here needs a write counterpart.

Each entry can optionally carry that version's own stats, which is what the history panel actually
renders — its whole point is showing whether an edit helped, so a version row without its numbers
is half the feature. Fetching them inline avoids one `GET .../stats?version=N` call per historical
version; `includeStats=false` skips the aggregate entirely when a caller only wants the templates.

| Query param | Type | Rules |
|---|---|---|
| `pageNo` | integer | optional, default `1`, min `1`. Example: `1` |
| `pageSize` | integer | optional, default `20`, min `1`, max `100`. Example: `20` |
| `includeStats` | boolean | optional, default `true`. Example: `true` |

Success `200`:

```json
{
  "data": [
    {
      "id": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0aa1",
      "version": 3,
      "template": "You are replying on behalf of {{business_name}} ...",
      "createdAt": "2026-08-25T09:30:00.000Z",
      "createdBy": { "userId": "0190f3b2-1c44-7a10-8f31-2b7c9e5d0002", "name": "Jane Doe" },
      "isCurrent": true,
      "stats": {
        "totalGenerated": 18,
        "approvedCount": 14,
        "approvedAsIsCount": 11,
        "approvedEditedCount": 3,
        "rejectedCount": 2,
        "pendingCount": 2,
        "supersededCount": 0,
        "averageDecisionMinutes": 12.4
      }
    }
  ],
  "pagination": { "pageNo": 1, "pageSize": 20, "totalCount": 3, "totalPages": 1 }
}
```

| Field | Type | Rules |
|---|---|---|
| `data[].version` | integer | `prompt_versions.version` |
| `data[].template` | string | `prompt_versions.template`, `NOT NULL` |
| `data[].createdAt` | string (ISO) | `prompt_versions.created_at` |
| `data[].createdBy` | object \| null | `created_by_user_id` join; null-safe per `GET /v1/prompts` |
| `data[].isCurrent` | boolean | `true` for the highest `version` only. Saves the client re-deriving it after paginating |
| `data[].stats` | object \| null | Omitted when `includeStats=false`. Same eight counters as [`GET /v1/prompts/:promptId/stats`](#get-v1promptspromptidstats), scoped to this version |
| `pagination` | object | `PaginationDetailsDto` (`src/common/dto/pagination.dto.ts`) — `pageNo`, `pageSize`, `totalCount`, `totalPages` |

Errors: `400` validation, `401`, `403`, `404 PROMPT_NOT_FOUND`, `429`, `500`.

### `POST /v1/prompts/:promptId/versions`

**Appends** a version. This is the only write in the module that touches template text, and it
never overwrites: the new row gets `version = max(version) + 1` for that prompt and every prior
row is left byte-identical, still referenced by the `review_responses` rows it generated. That is
what makes [`GET .../stats?version=N`](#get-v1promptspromptidstats) answerable at all — an
in-place update would leave historical drafts claiming to have come from text that never generated
them.

The insert is a single statement, not a read-then-write:

```sql
INSERT INTO prompt_versions (prompt_id, version, template, created_by_user_id)
SELECT $1, coalesce(max(version), 0) + 1, $2, $3
FROM prompt_versions
WHERE prompt_id = $1
  AND EXISTS (SELECT 1 FROM prompts WHERE id = $1 AND tenant_id = $4)
RETURNING id, version, created_at;
```

The `EXISTS` term is **mandatory and cannot be replaced by a column predicate**: `prompt_versions`
has no `tenant_id` of its own (see [Data model](./overview.md#data-model)), so tenant scoping on
this table is a join through `prompts` or it does not happen. Nor is it merely a read guard — the
live prompt is `MAX(version)`, so an appended row becomes the effective template immediately.
Without the `EXISTS`, a caller who knows another tenant's `promptId` rewrites the text that drafts
**every** reply that tenant subsequently posts to its public Google profile, including overriding
the reviewer-name rule `PLAN.md` §6 relies on being enforced at the prompt level. Zero rows
inserted (a foreign prompt, or none at all) → `404 PROMPT_NOT_FOUND`, never `403`.

Two concurrent saves can still both compute the same next `version`;
`idx_prompt_versions_prompt_id_version` (unique on `(prompt_id, version)`) makes the loser fail
rather than silently reordering history. The DB service retries once on unique violation and
returns `409 PROMPT_VERSION_CONFLICT` if the retry also loses — the append-only analogue of the
guarded compare-and-swap `PLAN.md` §8.4 specifies for `review_responses.status`. `created_by_user_id`
comes from the authenticated request, never from the body, so it cannot be spoofed.

A template byte-identical to the current version (after trimming) is rejected with
`409 PROMPT_TEMPLATE_UNCHANGED` rather than appended. A no-op version is not merely untidy: it
splits that wording's `review_responses` rows across two `prompt_version_id` values, so both
versions' stats come back thinner than the wording's real performance and neither is comparable to
anything.

Request:

```json
{
  "template": "You are replying on behalf of {{business_name}} to a {{rating}}-star review.\n\nReview: \"{{review_text}}\"\n\nWrite a warm, genuine thank-you reply. Do not repeat the reviewer's name. Keep it under 60 words."
}
```

| Field | Type | Rules |
|---|---|---|
| `template` | string | required, non-empty after trim, 1–20000 chars (`prompt_versions.template` is unbounded `TEXT`; the ceiling is a module-local constant guarding the model's context window, not a DB constraint). Must differ from the current version's template |

Success `201`:

```json
{
  "promptId": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0011",
  "version": {
    "id": "0190f4c9-2a18-7bb2-9c40-1e5a7d3f0bb2",
    "version": 4,
    "template": "You are replying on behalf of {{business_name}} to a {{rating}}-star review.\n\nReview: \"{{review_text}}\"\n\nWrite a warm, genuine thank-you reply. Do not repeat the reviewer's name. Keep it under 60 words.",
    "createdAt": "2026-09-04T11:02:13.441Z",
    "createdBy": { "userId": "0190f3b2-1c44-7a10-8f31-2b7c9e5d0002", "name": "Jane Doe" },
    "isCurrent": true,
    "stats": null
  },
  "versionCount": 4
}
```

`stats` is `null`, not zeroed: a version created a second ago has generated nothing, and the
frontend's `PromptVersionStatsLine` already renders a distinct "none generated" state for
`totalGenerated === 0`.

The response returns `version` so the client can render the new number immediately — note the
frontend currently derives it as `prompt.versions.length + 1` in `PromptService.createVersion`,
which is a mock-only shortcut. `version` numbers come from the database, and after a rejected
append or any gap they will not equal the array length.

Errors: `400` validation, `401`, `403`, `404 PROMPT_NOT_FOUND`,
`409 PROMPT_TEMPLATE_UNCHANGED`, `409 PROMPT_VERSION_CONFLICT`, `429`, `500`.

## Tone

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `PUT` | `/v1/prompts/:promptId/tone` | Bearer, `owner` | 20 / min |

### `PUT /v1/prompts/:promptId/tone`

Sets the tone for one prompt. `PUT`, not `POST`, because `tone` is a live setting updated in
place on the `prompts` row itself — the same treatment `name`/`description` already get, not a
separate history-bearing insert like a version.

The write is a plain, tenant-scoped `UPDATE` — no upsert, because the row (and the column) always
exists:

```sql
UPDATE prompts
SET tone = $1, updated_at = now()
WHERE id = $2 AND tenant_id = $3
RETURNING id, tone, updated_at;
```

Zero rows affected means the prompt doesn't exist for this tenant → `404 PROMPT_NOT_FOUND`, the
same enumeration-prevention stance as every other module (never `403` — see
[../auth/api-reference.md](../auth/api-reference.md#security-considerations)). There is no
`isDefaultTone` concept and nothing to fall back to: `tone` is `NOT NULL DEFAULT 'professional'`
(`0006_prompts.sql`), so every prompt has a concrete value from the moment it's created, and a
"clear the tone" affordance would have nothing meaningful to clear back to beyond re-setting it to
`professional` explicitly.

**This column carries no notion of whose setting it is.** It is the tenant's current tone for that
prompt, not a personal preference tied to the caller — there is exactly one owner per tenant
today, so "the tenant's tone" and "this owner's tone" are the same fact, and the schema doesn't
pretend otherwise by keying this by user. If a genuine per-member tone preference is ever wanted,
that's new schema (a table keyed by `(prompt_id, user_id)`, built when the requirement is real),
not a retrofit of this column — see the overview's [Why two
tables](../prompts/overview.md#why-two-tables-and-why-tone-sits-on-prompts-rather-than-its-own-table).

Request:

```json
{ "tone": "empathetic" }
```

| Field | Type | Rules |
|---|---|---|
| `tone` | enum | required, one of `friendly` \| `professional` \| `formal` \| `playful` \| `empathetic` (`prompt_tone`, `0006_prompts.sql`). Exactly the frontend's `PromptTone` union — no mapping layer either way |

Success `200`:

```json
{
  "promptId": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0011",
  "tone": "empathetic",
  "updatedAt": "2026-09-04T11:07:55.812Z"
}
```

A tone change appends **no** `prompt_versions` row and does not alter the current version. Tone is
layered on top of the template at render time, not baked into it; treating a tone toggle as an
edit would create history entries with identical template text and split that template's stats for
no reason.

Errors: `400` validation (unknown `tone` value), `401`, `403`, `404 PROMPT_NOT_FOUND`, `429`,
`500`.

## Prompt performance

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/prompts/:promptId/stats` | Bearer, `owner` | 30 / min |

### `GET /v1/prompts/:promptId/stats`

The server-side replacement for `apps/web/src/app/_libs/utils/prompt-analytics.ts`, which computes
these numbers in the browser today by loading every review with its drafts
(`usePromptAnalytics` → `ReviewService.getReviews()`) and aggregating client-side. That cannot
ship against real data: it means sending the tenant's entire review and draft history — reviewer
names and review text, personal data under `PLAN.md` §6 — to a browser in order to render six
numbers. The client-side function remains valuable as the executable definition of each counter,
and `prompt-analytics.test.ts` is the contract this endpoint must reproduce.

Omitting `version` aggregates every version of the prompt; `?version=N` scopes to one, which is
what the per-version stats line on each history entry needs. The `review_responses` side of this
join — the status machine, the `source` values, the partial unique indexes — is documented in
[Reviews module](../reviews/overview.md); only the prompt-attribution half is specified here.

| Query param | Type | Rules |
|---|---|---|
| `version` | integer | optional, min `1`. Scopes to one version; must exist for this prompt or `404 PROMPT_VERSION_NOT_FOUND`. Example: `3` |

Every counter, column by column. All eight come from `review_responses` rows reachable through
`prompt_version_id`; `status` is `response_status` and `source` is `response_source`, both from
`0000_foundation.sql`:

| Counter | Source |
|---|---|
| `totalGenerated` | `count(*)` of matched rows |
| `approvedCount` | `status IN ('approved', 'posted', 'post_failed')` |
| `approvedAsIsCount` | of those, `btrim(coalesce(original_content, content)) = btrim(content)` |
| `approvedEditedCount` | of those, `btrim(coalesce(original_content, content)) <> btrim(content)` |
| `rejectedCount` | `status = 'rejected'` |
| `pendingCount` | `status IN ('draft', 'pending_approval')` |
| `supersededCount` | `status = 'superseded'` |
| `averageDecisionMinutes` | `avg(extract(epoch from (decided_at - created_at)) / 60.0)` over rows with `decided_at IS NOT NULL`; `null` when none are decided |

Four of those mappings are decisions, not transcriptions, and each one changes the numbers:

- **`posted` and `post_failed` count as approved.** The frontend's `ReplyDraftStatus` union has
  only four values and stops at `approved`, but `response_status` has seven — a posted reply *was*
  approved by a human, and a `post_failed` one was too (the failure was Google's API, per
  `PLAN.md` §2). Counting only literal `'approved'` would drop exactly the drafts that succeeded
  most and silently deflate every approval rate.
- **`draft` folds into `pendingCount`.** `PLAN.md` §4.2's state machine starts at `draft` before
  `pending_approval`; both mean "no human has decided". The frontend union has no `draft` value,
  so folding it in server-side keeps the payload shape unchanged while making the counters sum
  correctly.
- **The edited/as-is split uses the content comparison, not `source`.** `response_source` has a
  `human_edited` value that looks like the same signal, but the comparison against
  `original_content` is what the frontend already does (`draft.content.trim() !== draft.originalContent.trim()`)
  and it survives a write path that forgets to flip `source`. `source = 'human_edited'` is worth
  asserting against in tests as a cross-check, not as the source of truth.
- **`original_content IS NULL` counts as as-is.** The column is nullable with no backfill (gap 5
  in the overview), so pre-migration rows have nothing to compare. `coalesce(original_content,
  content)` treats them as unedited, which keeps the invariant
  `approvedAsIsCount + approvedEditedCount = approvedCount` — the frontend divides one by the other
  to render an edited-rate, and a third "unknown" bucket would make that percentage wrong rather
  than merely incomplete.

The aggregate:

```sql
SELECT
  count(*)                                                             AS total_generated,
  count(*) FILTER (WHERE rr.status IN ('approved','posted','post_failed'))
                                                                       AS approved_count,
  count(*) FILTER (WHERE rr.status IN ('approved','posted','post_failed')
                     AND btrim(coalesce(rr.original_content, rr.content)) = btrim(rr.content))
                                                                       AS approved_as_is_count,
  count(*) FILTER (WHERE rr.status IN ('approved','posted','post_failed')
                     AND btrim(coalesce(rr.original_content, rr.content)) <> btrim(rr.content))
                                                                       AS approved_edited_count,
  count(*) FILTER (WHERE rr.status = 'rejected')                       AS rejected_count,
  count(*) FILTER (WHERE rr.status IN ('draft','pending_approval'))     AS pending_count,
  count(*) FILTER (WHERE rr.status = 'superseded')                     AS superseded_count,
  avg(extract(epoch FROM (rr.decided_at - rr.created_at)) / 60.0)
    FILTER (WHERE rr.decided_at IS NOT NULL)                           AS average_decision_minutes
FROM review_responses rr
JOIN prompt_versions pv ON pv.id = rr.prompt_version_id
WHERE pv.prompt_id = $1
  AND rr.tenant_id = $2
  AND rr.source IN ('ai_generated', 'human_edited')
  AND ($3::int IS NULL OR pv.version = $3);
```

The `source IN ('ai_generated', 'human_edited')` filter is defensive rather than strictly
necessary: `imported` and `human_manual` rows never went through a prompt and leave
`prompt_version_id` NULL, so the join already excludes them. Stating it explicitly means a future
write path that starts stamping `prompt_version_id` onto a manually-written reply cannot quietly
pollute prompt performance with drafts the prompt did not write.

**Index gap.** `idx_review_responses_prompt_version_id` (created by `0006_prompts.sql`) gets this
query to the right rows, but `status`, `source`, `tenant_id`, `content`, `original_content`,
`created_at` and `decided_at` are all heap fetches after that. A composite
`(prompt_version_id, status)` — or a covering
`(prompt_version_id) INCLUDE (status, source, decided_at, created_at)` — would keep it in the
index; a partial variant (`WHERE prompt_version_id IS NOT NULL`) would also shrink the index
substantially, since after the `PLAN.md` §7 backfill most `review_responses` rows are `imported`
with a NULL FK. Neither exists in the migration. Acceptable at MVP volumes (one location, a
15-minute poll), flagged because this is the one query here whose cost tracks total review history
rather than prompt count — see gap 4 in the
[overview](./overview.md#schema-gaps--required-follow-up-migrations).

Success `200`:

```json
{
  "promptId": "0190f4a1-7c33-7e51-9a02-6d1b8f4c0011",
  "version": 3,
  "stats": {
    "totalGenerated": 18,
    "approvedCount": 14,
    "approvedAsIsCount": 11,
    "approvedEditedCount": 3,
    "rejectedCount": 2,
    "pendingCount": 2,
    "supersededCount": 0,
    "averageDecisionMinutes": 12.4
  }
}
```

| Field | Type | Rules |
|---|---|---|
| `version` | integer \| null | Echoes the `version` query param; `null` when the aggregate spans every version |
| `stats.totalGenerated` | integer | ≥ 0. `0` is a normal state for a version created moments ago |
| `stats.approvedCount` | integer | ≥ 0 |
| `stats.approvedAsIsCount` | integer | ≥ 0. Invariant: `approvedAsIsCount + approvedEditedCount = approvedCount` |
| `stats.approvedEditedCount` | integer | ≥ 0 |
| `stats.rejectedCount` | integer | ≥ 0 |
| `stats.pendingCount` | integer | ≥ 0. Includes `draft` as well as `pending_approval` |
| `stats.supersededCount` | integer | ≥ 0. A superseded draft was never decided on its merits (a sibling won, or the review changed upstream) — kept separate from `rejected` for that reason |
| `stats.averageDecisionMinutes` | number \| null | Rounded to one decimal. `null` when no matched row has `decided_at` set |

**No precomputed rates.** The payload returns the same eight raw counters the frontend's
`PromptVersionStats` type already declares, and deliberately adds no `approvalRate` or
`editedRate`. `PromptVersionStatsLine` computes approval rate as
`approvedCount / (approvedCount + rejectedCount)` — over *decided* drafts only, excluding pending
and superseded — and edited rate as `approvedEditedCount / approvedCount`. Shipping a second
definition of "approval rate" from the server is how the two silently diverge; one definition,
client-side, over server-computed counters.

Errors: `400` validation, `401`, `403`, `404 PROMPT_NOT_FOUND`,
`404 PROMPT_VERSION_NOT_FOUND`, `429`, `500`.

## Error reference

Every row uses the shared error envelope
([Auth § Conventions](../auth/api-reference.md#conventions)). `message` values are the exact
strings to render, and each one lives in `MESSAGES.PROMPTS` in
`src/common/constants/messages.constants.ts`. `error` is the category string the frontend branches
on.

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | Any route with a body or query param | A `class-validator` rule failed — malformed `promptId` UUID, empty `template`, `template` over the length ceiling, `tone` outside `prompt_tone`, `version`/`pageNo`/`pageSize` non-integer or out of range. `message` is the comma-joined list of violations. |
| `401` | `Unauthorized` | All routes | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | All routes | Authenticated as a `member`, not an `owner`. Reply prompts are Settings-scoped (`PLAN.md` §2). Depends on `RolesGuard` being adapted to the schema's `user_role` enum first — see the auth [Gap](../auth/overview.md#gap-between-current-code-and-target-design). |
| `404` | `Not Found` (`PROMPT_NOT_FOUND`) | `GET /v1/prompts/:promptId`, both `/versions` routes, `/tone`, `/stats` | No `prompts` row with that id **for the caller's tenant**. Deliberately `404` rather than `403` for a prompt that exists on another tenant, so the response never confirms its existence. |
| `404` | `Not Found` (`PROMPT_VERSION_NOT_FOUND`) | `GET /v1/prompts/:promptId/stats` | `?version=N` names a version this prompt has never had. |
| `409` | `Conflict` (`PROMPT_TEMPLATE_UNCHANGED`) | `POST /v1/prompts/:promptId/versions` | The submitted `template` is identical (after trim) to the current version's. Refused rather than appended — a no-op version splits that wording's stats across two `prompt_version_id` values. |
| `409` | `Conflict` (`PROMPT_VERSION_CONFLICT`) | `POST /v1/prompts/:promptId/versions` | Two concurrent appends raced for the same `version` and the retry also lost `idx_prompt_versions_prompt_id_version`. Safe to retry the request; the client should re-read the prompt first, since someone else's edit has landed. |
| `429` | `Too Many Requests` | Any route | `ThrottlerGuard` limit for that route's tier — see the per-group throttle columns above and the auth overview's [Rate limiting](../auth/overview.md#rate-limiting-throttler). |
| `500` | `Internal Server Error` | Any route | Unhandled exception. Only `traceId` is safe to surface; detail stays server-side per `ErrorHandlerService.handleUnhandledError`. |

One failure mode that is **not** an error on this surface, called out so it is not mistaken for a
missing case:

- **A version with no generated drafts** is not `404` — it returns all-zero counters and
  `averageDecisionMinutes: null`, which the frontend already renders as a distinct "none generated"
  state.

One that would be, if the schema stayed as it is: **a tenant with no `prompts` rows at all**.
`GET /v1/prompts` returns an empty array, which the Settings screen renders as three missing cards
and the generation stage cannot recover from at all — `prompt_versions.template` is `NOT NULL` and
there is nothing to render. Nothing in the schema or in `PLAN.md` §8.10's signup transaction
currently creates those rows; see gap 2 in the
[overview](./overview.md#schema-gaps--required-follow-up-migrations). That is a provisioning gap to
close before build, not an error code to add.
