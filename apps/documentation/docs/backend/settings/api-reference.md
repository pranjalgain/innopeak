---
sidebar_position: 2
---

# Settings Module — API Reference

## How to read this document

This is the **target/spec design** for the settings module's HTTP surface. None of it exists in
`apps/backend/src/` yet — there is no `src/api/settings/`, no `src/db/repositories/settings/`, and
no settings slug in `src/common/route-names.ts` (see the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design)). The three tables behind it
(`tenant_settings`, `blocklist_terms`, `notification_recipients`) are migrated and empty of
readers. Nothing below describes code you can go and read today.

It assumes you have read [Settings Module — Overview](./overview.md) for the data model, the
downstream consumers of each setting, and the MVP-scope boundaries; this document turns those into
concrete request/response contracts rather than repeating them.

Deliberately HTTP-contract-level only — no controller or decorator code. Each route below lives
under `src/api/settings/` per `apps/backend/docs/conventions/module-structure.md`, split across
four controllers with one `swagger/<controller-name>.swagger.ts` file each: the JSON shown here is
what that route's Swagger decorator should render as its example. Every success and error `message`
string comes from `src/common/constants/messages.constants.ts` — which does not exist yet and must
be created — never an inline literal.

Every route is part of the backend's target surface regardless of whether the shipped frontend
calls it; several have no screen behind them today, and the overview's [MVP
scope](./overview.md#mvp-scope) says which. Don't drop one because the current UI has no button for
it.

## Conventions

- **Base paths**: `/v1/settings` (`RouteNames.SETTINGS`) for the three collections this module
  owns, and `/v1/tenant` (`RouteNames.TENANT`) for the tenant profile — a different resource, not a
  settings sub-collection, so it gets its own path rather than being buried at
  `/v1/settings/tenant`. Both use `version: '1'` in `@Controller()`; both slugs, plus
  `blocklist-terms` and `notification-recipients`, must be added to `RouteNames` (controller paths
  are never raw strings).
- **Auth column**: every route needs `Authorization: Bearer <access_token>` (or the `sid` cookie —
  `CookieAuthMiddleware` promotes it before the guards run). Nothing here is `@Public()`.
  `owner` / `owner+member` in the Auth column is the `user_role` requirement — see [Role
  requirements](#role-requirements).
- **Tenant scoping**: `tenant_id` always comes from the authenticated principal's JWT, never from a
  path, query, or body parameter. There is no route in this module that names a tenant. Every
  `:id` route's predicate is `WHERE id = $1 AND tenant_id = $2`, so a row belonging to another
  tenant returns `404`, never `403` — a `403` would confirm the id exists somewhere, which is the
  one thing a cross-tenant probe is looking for.
- **Token type must be checked before `tenant_id` is trusted.** Every route here requires
  `type === 'tenant_user'` (or a `support_access` token, which is read-only — see
  [Platform Admin](../platform-admin/api-reference.md#conventions)). This is not belt-and-braces:
  a `platform_admin` token carries **no** `tenantId` claim at all, so an unchecked route builds
  `WHERE tenant_id = undefined`, and in the usual Drizzle idiom
  `and(...[tenantId && eq(t.tenantId, tenantId), ...])` a falsy term is *dropped* rather than
  matching nothing — the tenant filter silently disappears and the endpoint returns every
  tenant's rows. Auth's security notes call this "the highest-severity mistake available in this
  module"; see [session/token model](../auth/api-reference.md#session--token-model-1).
- **Success and error envelopes**: identical to every other module — `TransformInterceptor` wraps
  2xx bodies, `HttpExceptionFilter` + `ErrorHandlerService` shape non-2xx ones
  (`src/common/dto/api-response.ts`). The `data` shapes below are the *inner* payload. Rather than
  restate both envelopes, their `traceId` semantics, and how `class-validator` failures collapse
  into one comma-joined `message`, see [Auth Module — API
  Reference](../auth/api-reference.md#conventions) — that section is the full version and this
  module adds nothing to it.
- **Throttling**: no per-route overrides. Everything here falls back to the global `short` tier
  (30 requests / minute, `apps/backend/src/app.module.ts`) — these are low-volume,
  already-authenticated, owner-only writes with nothing to brute-force.

## Role requirements

`PLAN.md` §2 defines the split unambiguously: `owner` gets "full tenant access: Settings page
(thresholds, blocklist, Google connection, inviting/removing users)"; `member` gets "review
workflow only … **no Settings access**." That translates into one rule with one exception:

- **Every route under `/v1/settings` requires `@Roles('owner')`.** All eight of them, reads
  included — a `member` must not be able to enumerate the blocklist or the recipient list, not just
  be blocked from writing them.
- **`GET /v1/tenant` allows `owner` or `member`** (no `@Roles` decorator, so `RolesGuard` passes
  automatically). It backs the dashboard's business-profile card, which every user of the tenant
  sees. It exposes only the business's own public-facing profile — nothing configuration-shaped.
- **`PATCH /v1/tenant` requires `@Roles('owner')`.** Renaming the business is a settings action
  that happens to live on a different path.

**Enforcement is entirely backend-side today.** The web app has no role gating anywhere: grepping
`apps/web/src` for `role` returns only `[role=checkbox]` CSS selectors in
`components/ui/table.tsx`. The sidebar links Settings unconditionally, and
`hooks/settings/use-settings.ts` never looks at the current user's role. That is consistent with
this engagement's single-owner scope, but it means the moment `member` accounts exist the frontend
must also hide the Settings nav item — otherwise a member sees the tab and gets a wall of `403`s on
load, which reads as a bug rather than a permission boundary.

One prerequisite: `RolesGuard` currently matches against `user.roles: string[]`, a shape from the
boilerplate's `roles`/`permissions` tables that this schema does not have. Until it is replaced
with the single `user_role` enum (see [Auth Module —
Overview](../auth/overview.md#gap-between-current-code-and-target-design)), `@Roles('owner')` on
these routes compiles and enforces nothing. Settings is the first module whose whole contract
depends on that fix landing.

## Tenant profile

| Method | Path | Auth |
|---|---|---|
| `GET` | `/v1/tenant` | Bearer, `owner` or `member` |
| `PATCH` | `/v1/tenant` | Bearer, `@Roles('owner')` |

### `GET /v1/tenant`

Returns the authenticated user's own business profile. Backs the dashboard's business-profile card
(`apps/web/src/app/(dashboard)/dashboard/_components/business-profile-card.tsx`) and, on the
frontend, `TenantService.getCurrentTenant()`.

This is **not** the same payload as [`GET /v1/auth/me`](../auth/api-reference.md#get-v1authme)'s
nested `tenant` object. That one carries `id`, `name`, and `status` — the three columns auth needs
to decide whether a session is usable. This route carries the business's *public profile*, most of
which is Google Business Profile data that lives on `locations`, not `tenants`. Keeping them
separate keeps a per-request session check from joining `locations` on every call.

**The profile is deliberately a composite of two tables, and half of it does not exist yet.** Per
field:

| Field | Type | Source |
|---|---|---|
| `id` | string (uuid) | `tenants.id` |
| `name` | string | `tenants.name` — the `businessName` captured at signup ([`POST /v1/auth/signup`](../auth/api-reference.md#post-v1authsignup)). The only writable field on this resource. |
| `status` | enum | `tenants.status` (`tenant_status`: `pending_activation` \| `active` \| `suspended`). Read-only — only a platform admin changes it. |
| `address` | string \| null | `locations.address` (`TEXT`, nullable). GBP-derived, written by the connections module's sync. |
| `businessType` | string \| null | **No column exists.** GBP's `categories.primaryCategory.displayName`. Needs `locations.primary_category VARCHAR(255)`. |
| `phone` | string \| null | **No column exists.** GBP's `phoneNumbers.primaryPhone`. Needs `locations.phone VARCHAR(50)`. |
| `googleRating` | number \| null | **No column exists.** GBP's own `averageRating`. Needs `locations.google_average_rating NUMERIC(2,1)`. |
| `googleReviewCount` | integer \| null | **No column exists.** GBP's own `totalReviewCount`. Needs `locations.google_review_count INTEGER`. |
| `profileSyncedAt` | string (ISO 8601) \| null | `locations.last_synced_at` — how stale the four GBP-derived fields above are. |

**Required follow-up migration.** Four of those nine fields have nowhere to live. `tenants` has
exactly four non-timestamp columns (`id`, `name`, `created_by_platform_admin_id`, `status`,
`0002_tenant_auth.sql`) and `locations` has `name`, `address`, `status`, and sync-observability
columns only (`0003_review_provider_locations.sql`) — no category, no phone, no rating aggregate
anywhere in the schema. The columns belong on `locations`, not `tenants`: they are per-location GBP
facts, and a multi-location tenant (`PLAN.md` §8.16) would have a different category and phone
number per location. That makes the migration the **connections module's** to write, since it owns
`locations` and the sync that would populate them — see `../connections/overview.md`. Flagged here
because this endpoint's contract is what depends on it: until it lands, those four fields are
always `null`.

**`null` there crashes the shipped UI — widening the frontend type is not sufficient.**
`business-profile-card.tsx:40` calls `tenant.googleRating.toFixed(1)` unguarded, and renders
`businessType`, `phone` and `googleReviewCount` directly; `Tenant` declares all four
non-nullable. So a spec-compliant `null` is a `TypeError`, not a blank cell. Until the migration
lands this endpoint must therefore either emit `0`/`""` sentinels for the four columnless fields,
or the card has to be made null-safe first — pick one deliberately before this contract ships,
because "return `null` and widen the type" silently means "the dashboard throws on load."

**`googleRating` / `googleReviewCount` must be cached from GBP, not computed from `reviews`.** The
frontend's own type comment says it: "Google's own aggregate rating/review count — distinct from
InnoPeak's review queue stats." `AVG(reviews.rating)` is a genuinely different number and drifts
further every day — it only covers reviews this system ingested, and the nightly GDPR purge
(`PLAN.md` §6) bounds how far back rows go at all. Two numbers that look alike and disagree is
worse than one that is honestly stale, hence `profileSyncedAt`.

**Which location.** MVP is one tenant, one location (`PLAN.md` Context), but the query still picks
deterministically rather than relying on that: `WHERE tenant_id = $1 AND status = 'active' ORDER BY
created_at ASC LIMIT 1`. A tenant that has not connected GBP yet has no `locations` row and every
GBP-derived field is `null` — a `200`, not a `404`.

Success `200`:

```json
{
  "id": "0190f3aa-7c31-7f2e-9b41-2f6a5c8d1e04",
  "name": "The Coastal Table",
  "status": "active",
  "businessType": "Seafood restaurant",
  "address": "214 Harborview St, Portland, ME",
  "phone": "(207) 555-0148",
  "googleRating": 4.6,
  "googleReviewCount": 312,
  "profileSyncedAt": "2026-09-01T14:15:00Z"
}
```

Errors: `401` (missing/expired token), `403 TENANT_SUSPENDED`, `500`.

### `PATCH /v1/tenant`

Updates the business name — the one writable column on `tenants` from this module. Tenant
*creation* is the auth module's signup transaction (`PLAN.md` §4.3a, §8.10); this endpoint exists
because nothing else lets an owner fix a name typed once into a signup form and surfaced
permanently on the dashboard.

`PATCH`, not `PUT`, precisely because the resource is a composite: seven of the nine fields
[`GET /v1/tenant`](#get-v1tenant) returns are provider-derived or platform-controlled. A
full-resource `PUT` would invite clients to send back `googleRating` and `status` for the server to
silently discard — a contract that lies about what it accepts.

This does **not** rename the GBP location. `locations.name` is sync-owned by the connections module
and overwritten on the next poll; `tenants.name` is InnoPeak's own label for the business. They can
legitimately differ, and this route only touches the latter.

Request:

```json
{
  "name": "The Coastal Table"
}
```

| Field | Type | Rules |
|---|---|---|
| `name` | string | required, trimmed, 1–255 chars (`tenants.name` is `VARCHAR(255) NOT NULL`), must be non-empty after trimming |

Success `200` — the full profile, every field and the same shape as
[`GET /v1/tenant`](#get-v1tenant) above, so the client needs no follow-up read:

```json
{
  "id": "0190f3aa-7c31-7f2e-9b41-2f6a5c8d1e04",
  "name": "The Coastal Table",
  "status": "active",
  "businessType": "Seafood restaurant",
  "address": "214 Harborview St, Portland, ME",
  "phone": "(207) 555-0148",
  "googleRating": 4.6,
  "googleReviewCount": 312,
  "profileSyncedAt": "2026-09-01T14:15:00Z"
}
```

Errors: `400` validation, `401`, `403` (authenticated as `member`), `403 TENANT_SUSPENDED`, `500`.

## Tenant settings

| Method | Path | Auth |
|---|---|---|
| `GET` | `/v1/settings` | Bearer, `@Roles('owner')` |
| `PUT` | `/v1/settings` | Bearer, `@Roles('owner')` |

**`tenant_settings` is a singleton per tenant, enforced by the database**:
`idx_tenant_settings_tenant_id` is a `CREATE UNIQUE INDEX`, not a plain one
(`0002_tenant_auth.sql`). That is why this resource has no `:id` in its path, no list route, and no
`POST` — there is exactly one row and the client never names it. The update is therefore a
full-resource write on a singleton, not an item in a collection.

**The row must already exist.** `escalation_rating_threshold` is `NOT NULL` with **no database
default**, and classification cannot run without it — which is exactly why `PLAN.md` §8.10 puts
`INSERT tenant_settings` inside the signup transaction alongside `tenants` and `users` (`PLAN.md`
§4.3a's diagram shows the defaults it writes: `escalation_rating_threshold = 3`,
`auto_post_enabled = false`). Neither route below creates the row. Both `404` if it is missing.

### `GET /v1/settings`

Reads the singleton. Backs the General tab's initial render
(`SettingsService.getSettings()` → `general`).

Success `200`:

```json
{
  "id": "0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33",
  "escalationRatingThreshold": 3,
  "autoPostEnabled": false,
  "reviewDataRetentionMonths": 24,
  "updatedAt": "2026-08-28T09:12:44Z"
}
```

| Field | Type | Source |
|---|---|---|
| `id` | string (uuid) | `tenant_settings.id` |
| `escalationRatingThreshold` | integer 1–5 | `tenant_settings.escalation_rating_threshold` |
| `autoPostEnabled` | boolean | `tenant_settings.auto_post_enabled` |
| `reviewDataRetentionMonths` | integer \| null | `tenant_settings.review_data_retention_months` — `null` means "use the platform default" (`PLAN.md` §6), **not** "keep forever" |
| `updatedAt` | string (ISO 8601) | `tenant_settings.updated_at` |

`tenant_id` is deliberately not echoed back: the caller's token already determines it, and
returning it invites a client to think it could send a different one.

Errors: `401`, `403` (member), `404 TENANT_SETTINGS_MISSING`, `500`.

A `404` here means a tenant was provisioned through a path that skipped `PLAN.md` §8.10's
transaction — an early tenant, a partial signup crash, or a manual insert. This route deliberately
does **not** lazily create the row with defaults on read: a `GET` that writes is surprising, and
more importantly a silently-defaulted threshold converts the loud "this tenant cannot classify"
failure §8.10 exists to prevent into a quiet "this tenant classifies against a threshold nobody
chose." Fail visibly and fix the tenant.

### `PUT /v1/settings`

Replaces the settings singleton. Backs the General tab's three controls — the escalation-threshold
slider, the auto-post switch, and the retention-months input.

**`aiReplyCount` is deliberately absent from this contract, and that is a gap, not a decision.**
The frontend's `GeneralSettings` has four fields; the Settings → AI tab renders a 1–3 reply-count
select wired straight through `updateGeneral`, so as specified this `PUT` **cannot round-trip the
type the client holds**. `tenant_settings` has no `ai_reply_count` column
(`0002_tenant_auth.sql:86-95`) — see the [overview's gap list](./overview.md#gap-between-current-code-and-target-design)
for the proposed `ai_reply_count INTEGER NOT NULL DEFAULT 1 CHECK (BETWEEN 1 AND 3)`. Add the
column and a fourth field here together; until then the AI tab's select is mock-only and must not
be wired to this route.

**`PUT`, not `PATCH`.** Three fields today, all always rendered and always populated on the one form that
writes them, and the frontend already models the save as a full-resource write
(`SettingsService.updateSettings` — "mocks a full-resource PUT"). A `PATCH` variant would add a
second contract, and a second set of "absent vs. explicitly null" rules, for a resource where the
client always holds the complete state. The one place that matters: **omitting
`reviewDataRetentionMonths` stores `NULL`**, which is the intended way to hand retention back to
the platform default — the only field where absence is meaningful rather than a validation error.

**This write is not retroactive.** Per `PLAN.md` §8.11, changing `escalationRatingThreshold` does
**not** reclassify already-classified reviews, and no backfill job is queued on save. A review
classified one second before the threshold moved keeps its `classification` and `escalation_reason`
permanently, unless something unrelated (an upstream edit, `PLAN.md` §8.6) re-triggers
classification. The new value applies to the next review the pipeline classifies after this call
commits, and to nothing before it. A `200` means "stored," never "and the queue has been
re-evaluated" — stated here so "I lowered the threshold and my old 2★ reviews still aren't
escalated" gets answered from the contract rather than debugged as a bug.

Request:

```json
{
  "escalationRatingThreshold": 3,
  "autoPostEnabled": false,
  "reviewDataRetentionMonths": 24
}
```

| Field | Type | Rules |
|---|---|---|
| `escalationRatingThreshold` | integer | required, `1`–`5` inclusive — mirrors `tenant_settings_escalation_rating_threshold_check` exactly, so a bad value is a `400` and never a database constraint violation. Matches the frontend slider's `min=1 max=5 step=1`. |
| `autoPostEnabled` | boolean | required. Persisted as sent; the posting pipeline still requires human approval for MVP regardless (`PLAN.md` §2 — "MVP always false via app logic"). See the note below. |
| `reviewDataRetentionMonths` | integer \| null | optional; `>= 1` when present. Omitted or `null` → stored as `NULL` = platform default (`PLAN.md` §6). No upper bound enforced — a very large value is functionally "keep indefinitely" and is the tenant's call. |

**On `autoPostEnabled`.** `PLAN.md` §2 keeps auto-post off for MVP "via app logic," while the
shipped General tab renders a real switch that toasts success on toggle. This endpoint **accepts
and persists** whatever the owner set — a switch whose value is silently discarded is worse than
one whose effect is deferred, and the column exists precisely to hold the preference. The
alternative, rejecting `true` with a `400 AUTO_POST_NOT_AVAILABLE`, was considered and not chosen:
it makes a control the UI renders as available fail on use. What actually needs fixing is the UI's
helper copy, which should say approval is still required — flagged for product rather than resolved
by making the endpoint lie in either direction.

Success `200` — the stored resource, same shape as [`GET /v1/settings`](#get-v1settings):

```json
{
  "id": "0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33",
  "escalationRatingThreshold": 3,
  "autoPostEnabled": false,
  "reviewDataRetentionMonths": 24,
  "updatedAt": "2026-09-04T11:02:07Z"
}
```

Errors: `400` validation, `401`, `403` (member), `404 TENANT_SETTINGS_MISSING`, `500`.

The `404` matters: this is an `UPDATE`, deliberately not an upsert. An upsert would paper over the
§8.10 provisioning gap by inventing a row on first save — meaning a tenant broken since signup
would appear to heal itself the first time an owner touched the Settings page, and stay broken for
every tenant whose owner never did.

## Blocklist terms

| Method | Path | Auth |
|---|---|---|
| `GET` | `/v1/settings/blocklist-terms` | Bearer, `@Roles('owner')` |
| `POST` | `/v1/settings/blocklist-terms` | Bearer, `@Roles('owner')` |
| `PATCH` | `/v1/settings/blocklist-terms/:id` | Bearer, `@Roles('owner')` |
| `DELETE` | `/v1/settings/blocklist-terms/:id` | Bearer, `@Roles('owner')` |

An active term is the **first** check in `PLAN.md` §3's classification rule — before the rating
comparison — so a matching review escalates with `escalation_reason = 'blocklist_match'` regardless
of how many stars it has. Everything in this section is therefore a change to how future reviews
route, and none of it is retroactive (`PLAN.md` §8.11).

Uniqueness is **case-insensitive and covers inactive rows**:
`idx_blocklist_terms_tenant_id_lower_term` is `CREATE UNIQUE INDEX … ON blocklist_terms(tenant_id,
lower(term))` (`PLAN.md` §2, `blocklist_terms`). That single fact drives the `POST` behaviour
below.

### `GET /v1/settings/blocklist-terms`

Lists the tenant's terms. Backs the Blocklist tab's chip list.

Returns **both active and inactive** rows by default, because the case-insensitive unique index
covers inactive rows too — a client that only sees active terms cannot explain why adding "Lawsuit"
collides with nothing it can see. `?isActive=true` narrows it to what the classifier actually uses.
Ordered by `lower(term) ASC`, matching the unique index, so the order is stable and index-served
rather than sorted.

| Query param | Type | Rules |
|---|---|---|
| `isActive` | boolean | optional; omitted returns every row regardless of state |

Success `200`:

```json
{
  "items": [
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8", "term": "food poisoning", "isActive": true, "createdAt": "2026-08-11T10:04:19Z" },
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2d9", "term": "health inspector", "isActive": true, "createdAt": "2026-08-11T10:04:31Z" },
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2da", "term": "lawsuit", "isActive": true, "createdAt": "2026-08-11T10:03:52Z" },
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2db", "term": "lawyer", "isActive": false, "createdAt": "2026-08-11T10:04:07Z" }
  ],
  "total": 4
}
```

| Field | Type | Source |
|---|---|---|
| `items[].id` | string (uuid) | `blocklist_terms.id` |
| `items[].term` | string | `blocklist_terms.term` — stored verbatim, with original casing |
| `items[].isActive` | boolean | `blocklist_terms.is_active`; only `true` rows participate in `PLAN.md` §3 |
| `items[].createdAt` | string (ISO 8601) | `blocklist_terms.created_at` |
| `total` | integer | Count of returned rows. Not paginated — a keyword blocklist is tens of rows, not thousands; `total` is there so the shape does not have to change if pagination is ever added. |

Errors: `401`, `403` (member), `500`.

### `POST /v1/settings/blocklist-terms`

Adds a term. Backs the Blocklist tab's add-term input.

**A collision with an inactive row reactivates it rather than failing.** Because the unique index
covers `is_active = false` rows, a plain insert would make any term the owner previously
deactivated permanently un-re-addable — the row blocking the insert is one the client cannot even
see in the default UI. So this route resolves the conflict in one statement rather than reading
first:

```sql
INSERT INTO blocklist_terms (tenant_id, term)
VALUES ($1, $2)
ON CONFLICT (tenant_id, lower(term))
DO UPDATE SET term = EXCLUDED.term, is_active = true, updated_at = NOW()
WHERE blocklist_terms.is_active = false
RETURNING *;
```

Three outcomes, all decided by the database with no read-then-write window: a brand-new row →
`201`; a conflict with an **inactive** row → that row is reactivated (and its casing updated to
what was just typed) → `200`; a conflict with an **active** row → the `WHERE` filters the
`DO UPDATE` out, zero rows return, and the service raises `409 BLOCKLIST_TERM_EXISTS`. The `409` is
the right answer there — the term is already doing exactly what the owner is asking for.

Request:

```json
{
  "term": "food poisoning"
}
```

| Field | Type | Rules |
|---|---|---|
| `term` | string | required, trimmed, 1–255 chars (`VARCHAR(255) NOT NULL`), non-empty after trimming. Stored with the casing sent; matched case-insensitively. Multi-word phrases are valid — the client's own blocklist contains "food poisoning" and "health inspector". No `match_type` is accepted: `PLAN.md` §2 lists `exact`/`contains`/`regex` as a possible fast-follow, explicitly not MVP, so match semantics are the classifier's and not stored per term. |

Success `201` (new row) or `200` (an inactive row was reactivated — `reactivated: true`):

```json
{
  "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8",
  "term": "food poisoning",
  "isActive": true,
  "reactivated": false,
  "createdAt": "2026-09-04T11:06:12Z"
}
```

Errors: `400` validation, `401`, `403` (member), `409 BLOCKLIST_TERM_EXISTS`, `500`.

### `PATCH /v1/settings/blocklist-terms/:id`

Renames a term and/or flips `is_active`. **No screen calls this today** — the Blocklist tab offers
add and remove only. It is in the contract because `is_active` is the column `PLAN.md` §3 actually
filters on, so the API needs a way to write it; muting a term without losing it is what the column
exists for.

Renaming re-enters the same case-insensitive unique index as `POST`, so a rename onto an existing
term (active or inactive) is a `409`. Unlike `POST`, a rename does **not** absorb the colliding row
— merging two terms by renaming is data loss disguised as an edit; delete one and rename the other.

Request (at least one field required):

```json
{
  "term": "lawsuit threat",
  "isActive": false
}
```

| Field | Type | Rules |
|---|---|---|
| `term` | string | optional; same rules as `POST` — trimmed, 1–255 chars, non-empty |
| `isActive` | boolean | optional |

An empty body is `400 NO_FIELDS_TO_UPDATE` rather than a no-op `200`: a client that sent nothing
meant to send something.

Success `200`:

```json
{
  "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2da",
  "term": "lawsuit threat",
  "isActive": false,
  "updatedAt": "2026-09-04T11:08:40Z"
}
```

Errors: `400` validation, `400 NO_FIELDS_TO_UPDATE`, `401`, `403` (member),
`404 BLOCKLIST_TERM_NOT_FOUND`, `409 BLOCKLIST_TERM_EXISTS`, `500`.

### `DELETE /v1/settings/blocklist-terms/:id`

Removes a term permanently. Backs the chip's X button in the Blocklist tab.

**A hard `DELETE`, not `is_active = false`.** Two reasons, and neither is convenience. First, the
UI's affordance is a removal, not a mute — leaving a soft-deleted row behind would make the next
`POST` of the same word return `200 reactivated: true` for something the owner believes they
deleted. Second, deleting the row does not destroy the history of why a past review escalated:
`reviews.matched_keywords` stores the matched term text on the review itself (`PLAN.md` §2,
`reviews`), and `blocklist_terms_audit_trigger` writes a full `old_value` snapshot into
`audit_logs` on every `DELETE` (`0000_foundation.sql`). The audit story survives the row.

No request body.

| Field | Type | Rules |
|---|---|---|
| `id` (path) | string (uuid) | required, must be a valid UUID and belong to the caller's tenant |

Success `200`:

```json
{
  "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2da",
  "message": "Blocklist term removed"
}
```

Errors: `401`, `403` (member), `404 BLOCKLIST_TERM_NOT_FOUND`, `500`.

## Notification recipients

| Method | Path | Auth |
|---|---|---|
| `GET` | `/v1/settings/notification-recipients` | Bearer, `@Roles('owner')` |
| `POST` | `/v1/settings/notification-recipients` | Bearer, `@Roles('owner')` |
| `PATCH` | `/v1/settings/notification-recipients/:id` | Bearer, `@Roles('owner')` |
| `DELETE` | `/v1/settings/notification-recipients/:id` | Bearer, `@Roles('owner')` |

This is the "responsible employee" configuration from `PLAN.md` §3's classification diagram — every
active row for `notification_type = 'escalation'` becomes one or two `notifications` rows per
escalation event, depending on `channel`. A recipient is always an existing app user
(`notification_recipients.user_id` is `NOT NULL REFERENCES users(id) ON DELETE CASCADE`), never a
free-text address: escalation payloads include review text and reviewer names, so a recipient list
that could hold arbitrary emails would be a GDPR-relevant data-egress path with no access control
behind it.

`channel` is `notification_channel_pref` (`email` \| `teams` \| `both`) — the **preference**, not
the per-send `notification_channel` (`email` \| `teams`) on `notifications`. See the overview's
[Data model](./overview.md#data-model) for why the two value lists differ.

### `GET /v1/settings/notification-recipients`

Lists the tenant's recipients, joined to `users` for the display name and email — the table itself
holds only a `user_id`, and a list of UUIDs is not a settings screen. Backs the Notifications tab's
rows. There is no `initials` column and none is needed: the frontend's
`NotificationRecipient.initials` is returned derived server-side — the frontend consumes it as
data (`notifications-settings-section.tsx:35`) rather than computing it, matching how
`AttentionReview.initials` is already supplied.

Success `200`:

```json
{
  "items": [
    {
      "id": "0190f3d2-6e55-7c18-a20b-8d3f1e4c9a67",
      "userId": "0190f3b2-4d90-7a55-b7e2-9f1c3a6d8e21",
      "name": "Maria Delgado",
      "email": "maria@thecoastaltable.com",
      "notificationType": "escalation",
      "channel": "both",
      "isActive": true,
      "createdAt": "2026-08-11T10:12:03Z"
    }
  ],
  "total": 1
}
```

| Field | Type | Source |
|---|---|---|
| `items[].id` | string (uuid) | `notification_recipients.id` — the id every `PATCH`/`DELETE` below takes, **not** the user's id |
| `items[].userId` | string (uuid) | `notification_recipients.user_id` |
| `items[].name` | string | `users.name` (joined) |
| `items[].email` | string | `users.email` (joined) — the address an `email`/`both` recipient is actually reached at; there is no separate notification address |
| `items[].notificationType` | enum | `notification_recipients.notification_type` (`notification_type`: `escalation` only today) |
| `items[].channel` | enum | `notification_recipients.channel` (`notification_channel_pref`: `email` \| `teams` \| `both`) |
| `items[].isActive` | boolean | `notification_recipients.is_active` — `false` means configured but not delivered to |
| `items[].createdAt` | string (ISO 8601) | `notification_recipients.created_at` |
| `total` | integer | Count of returned rows. Not paginated. |

**A tenant with zero active recipients escalates into the void** — reviews still classify as
`escalated` and still queue in the dashboard, but nobody is told. Nothing in the schema prevents
that state and this endpoint is the only place it is visible, so a client rendering an empty (or
all-inactive) list should say so rather than showing an empty card.

Errors: `401`, `403` (member), `500`.

### `POST /v1/settings/notification-recipients`

Adds an existing tenant user as an escalation recipient. **No screen calls this today** — the
Notifications tab iterates a list it never grows. Documented because the product concept is plural
("responsible employee", `PLAN.md` §3), because `PLAN.md` §2 explicitly allows "any user …
regardless of role", and because a tenant that has removed its last recipient currently has no way
back. `userId` must belong to the caller's own tenant; a user from another tenant returns
`404 USER_NOT_FOUND`.

Request:

```json
{
  "userId": "0190f3b2-4d90-7a55-b7e2-9f1c3a6d8e21",
  "notificationType": "escalation",
  "channel": "both"
}
```

| Field | Type | Rules |
|---|---|---|
| `userId` | string (uuid) | required, valid UUID, must be a `users` row with `tenant_id` = the caller's tenant. Any `role` is acceptable — a `member` can be a recipient even though a `member` cannot open this screen (`PLAN.md` §2). |
| `notificationType` | enum | optional, defaults to `escalation`; the only value `notification_type` has (`0000_foundation.sql`). Accepted as an explicit field rather than hardcoded so adding a second type later is an enum change plus a value, not a new endpoint — `PLAN.md` §2 confirms no digest type is planned, so it stays optional. |
| `channel` | enum | required, one of `email` \| `teams` \| `both` (`notification_channel_pref`) |

**Required follow-up migration — this route cannot be made safe without it.**
`notification_recipients` has **no unique constraint**: `0003_review_provider_locations.sql` creates
only `idx_notification_recipients_tenant_id` and `idx_notification_recipients_user_id`, both plain
indexes. Nothing stops two rows with the same `(tenant_id, user_id, notification_type)`. Needed:

```sql
CREATE UNIQUE INDEX idx_notification_recipients_tenant_user_type
    ON notification_recipients(tenant_id, user_id, notification_type);
```

Until it lands, this endpoint has to enforce uniqueness in application code — a `SELECT` then an
`INSERT` in one transaction, still racy under two concurrent submits. Worth naming what a duplicate
would and would not break: the escalation composer inserting one `notifications` row per recipient
row would attempt two inserts for the same person, and the second would violate
`idx_notifications_review_recipient_type` (`0005_notifications.sql`, unique on `(review_id,
recipient_user_id, type, generation_group_id)`) — so the duplicate does *not* send two emails. It
produces a silently failing insert on every escalation instead: `PLAN.md` §8.13's failure mode one
level down, where the send appears deduplicated but was deduplicated by accident. Fix it at the
source with the index.

Success `201`:

```json
{
  "id": "0190f3d2-6e55-7c18-a20b-8d3f1e4c9a67",
  "userId": "0190f3b2-4d90-7a55-b7e2-9f1c3a6d8e21",
  "name": "Maria Delgado",
  "email": "maria@thecoastaltable.com",
  "notificationType": "escalation",
  "channel": "both",
  "isActive": true,
  "createdAt": "2026-09-04T11:14:55Z"
}
```

Errors: `400` validation, `401`, `403` (member), `404 USER_NOT_FOUND`,
`409 RECIPIENT_ALREADY_EXISTS`, `500`.

### `PATCH /v1/settings/notification-recipients/:id`

Changes a recipient's `channel` and/or `is_active`. Backs both controls on the Notifications tab —
the `email`/`teams`/`both` toggle-group and the active switch.

Each control is a discrete mutation of one recipient, which is exactly a `PATCH` on one row — not a
field inside [`PUT /v1/settings`](#put-v1settings). This is the clearest place the frontend's single
composite `SettingsService.updateSettings(SettingsData)` mock has to be split:
`use-settings.ts`'s `updateRecipientChannel` and `toggleRecipientActive` each become one call here,
while `updateGeneral` becomes one call to `PUT /v1/settings`.

`userId` and `notificationType` are **not** editable — repointing a recipient row at a different
person is a delete plus a create, and allowing it here would sidestep the uniqueness the follow-up
index above is meant to guarantee.

Request (at least one field required):

```json
{
  "channel": "email",
  "isActive": true
}
```

| Field | Type | Rules |
|---|---|---|
| `channel` | enum | optional, one of `email` \| `teams` \| `both` |
| `isActive` | boolean | optional |

Success `200`:

```json
{
  "id": "0190f3d2-6e55-7c18-a20b-8d3f1e4c9a67",
  "userId": "0190f3b2-4d90-7a55-b7e2-9f1c3a6d8e21",
  "name": "Maria Delgado",
  "email": "maria@thecoastaltable.com",
  "notificationType": "escalation",
  "channel": "email",
  "isActive": true,
  "updatedAt": "2026-09-04T11:16:31Z"
}
```

Errors: `400` validation, `400 NO_FIELDS_TO_UPDATE`, `401`, `403` (member),
`404 RECIPIENT_NOT_FOUND`, `500`.

### `DELETE /v1/settings/notification-recipients/:id`

Removes a recipient configuration permanently. **No screen calls this today** — the Notifications
tab's switch writes `is_active` instead, which is the right affordance for "stop paging Maria while
she's on leave." Both exist on purpose and mean different things: `is_active = false` keeps the row
and its channel preference so re-enabling is one toggle; `DELETE` discards the configuration.

This deletes **only the recipient configuration**. Historical `notifications` rows already sent to
that user live in a different table, owned by the notifications module, and are untouched — the
record of what was sent to whom must outlive a preference change.

No request body.

| Field | Type | Rules |
|---|---|---|
| `id` (path) | string (uuid) | required, valid UUID, must belong to the caller's tenant |

Success `200`:

```json
{
  "id": "0190f3d2-6e55-7c18-a20b-8d3f1e4c9a67",
  "message": "Notification recipient removed"
}
```

Errors: `401`, `403` (member), `404 RECIPIENT_NOT_FOUND`, `500`.

## Error reference

Every error uses the standard error envelope — see [Auth Module — API
Reference](../auth/api-reference.md#conventions). `message` values come from
`src/common/constants/messages.constants.ts` and are safe to render to the user for every 4xx
below; `error` is the category string the frontend branches on.

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | Every route with a body or query param | A `class-validator` rule failed — threshold outside 1–5, empty `term`, unknown `channel` value, malformed `:id` UUID. `message` is the comma-joined list of violations. |
| `400` | `NO_FIELDS_TO_UPDATE` | `PATCH /v1/settings/blocklist-terms/:id`, `PATCH /v1/settings/notification-recipients/:id` | An empty `PATCH` body. Deliberately not a no-op `200` — a client that sent nothing meant to send something. |
| `401` | `Unauthorized` | Every route | Missing, malformed, or expired access token. Nothing in this module is `@Public()`. |
| `403` | `Forbidden` | Every route under `/v1/settings`, plus `PATCH /v1/tenant` | Authenticated as `member`, not `owner` (`PLAN.md` §2 — see [Role requirements](#role-requirements)). |
| `403` | `TENANT_SUSPENDED` | Every route | `tenants.status = 'suspended'`. Note `PLAN.md` §8.20: a token issued before suspension keeps working until it expires. |
| `404` | `TENANT_SETTINGS_MISSING` | `GET /v1/settings`, `PUT /v1/settings` | No `tenant_settings` row for this tenant — a tenant provisioned outside `PLAN.md` §8.10's signup transaction. Neither route creates it; see [`GET /v1/settings`](#get-v1settings). |
| `404` | `BLOCKLIST_TERM_NOT_FOUND` | `PATCH`/`DELETE /v1/settings/blocklist-terms/:id` | No such term **for this tenant**. Also returned for a term that exists under a different tenant — `403` there would confirm the id exists. |
| `404` | `RECIPIENT_NOT_FOUND` | `PATCH`/`DELETE /v1/settings/notification-recipients/:id` | Same rule, for `notification_recipients.id`. |
| `404` | `USER_NOT_FOUND` | `POST /v1/settings/notification-recipients` | `userId` is not a `users` row in the caller's tenant. Same non-confirmation reasoning. |
| `409` | `BLOCKLIST_TERM_EXISTS` | `POST /v1/settings/blocklist-terms`, `PATCH /v1/settings/blocklist-terms/:id` | `lower(term)` collides with an **active** row (`idx_blocklist_terms_tenant_id_lower_term`). A collision with an *inactive* row is not an error on `POST` — it reactivates and returns `200`. |
| `409` | `RECIPIENT_ALREADY_EXISTS` | `POST /v1/settings/notification-recipients` | This user is already a recipient for this `notification_type`. Application-enforced until the unique index above is migrated, and therefore racy under concurrent submits. |
| `429` | `Too Many Requests` | Every route | The global `short` tier (30 / minute) — this module sets no per-route override. |
| `500` | `Internal Server Error` | Every route | Unhandled exception. Only `traceId` is safe to show the user. A CHECK-constraint violation reaching here (rather than surfacing as `400`) means DTO validation drifted from the schema — treat it as a bug in the DTO, not in the caller. |

No route in this module returns `422`, and none returns `204`: every success carries a body so the
standard envelope always has something to wrap.
