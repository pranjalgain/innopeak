---
sidebar_position: 2
---

# Settings Module — API Reference

## How to read this document

This document is the **target/spec design** for the settings HTTP surface. **Blocklist
`GET`/`POST`/`DELETE /v1/settings/blocklist-terms`, the `tenant_settings` singleton
`GET`/`PUT /v1/settings`, and the whole Team members surface — `GET`/`POST
/v1/settings/members`, `DELETE /v1/settings/members/:memberId`, and the two removal routes
`POST /v1/settings/members/:memberId/request-removal` / `POST
/v1/settings/members/:memberId/cancel-removal` — are implemented** (`src/api/settings/`). Tenant
profile, notification-recipients, and blocklist `PATCH` are still spec only — see the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design). The tables (`tenant_settings`,
`blocklist_terms`, `notification_recipients`) are migrated; Team members has no table of its own —
it reads and writes `users`, owned by the auth module (`src/db/repositories/auth/`).

It assumes you have read [Settings Module — Overview](./overview.md) for the data model, the
downstream consumers of each setting, and the MVP-scope boundaries; this document turns those into
concrete request/response contracts rather than repeating them.

Deliberately HTTP-contract-level only — no controller or decorator code. Each route below lives
under `src/api/settings/` per `apps/backend/docs/conventions/module-structure.md`, split across
controllers with one `swagger/<controller-name>.swagger.ts` file each: the JSON shown here is
what that route's Swagger decorator should render as its example. Every success and error `message`
string comes from `src/common/constants/messages.constants.ts`, never an inline literal.

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
- **Every route under `/v1/settings/members` requires `@Roles('owner')`, with no exception.**
  `PLAN.md` §2's own wording for the owner role is "full tenant access … inviting/removing
  users" — team management is the literal thing that sentence is describing. A `member` cannot
  list the roster, invite a teammate, revoke an invite, or request/cancel another member's
  removal; there is no read-only carve-out here the way `GET /v1/tenant` has one.

**Enforcement is entirely backend-side today.** The web app has no role gating anywhere: grepping
`apps/web/src` for `role` returns only `[role=checkbox]` CSS selectors in
`components/ui/table.tsx`. The sidebar links Settings unconditionally, and
`hooks/settings/use-settings.ts` never looks at the current user's role. That is consistent with
this engagement's single-owner scope, but it means the moment `member` accounts exist the frontend
must also hide the Settings nav item — otherwise a member sees the tab and gets a wall of `403`s on
load, which reads as a bug rather than a permission boundary.

> **Corrected (implementation pass).** This previously said `RolesGuard` matched against a
> boilerplate `user.roles: string[]` shape and that `@Roles('owner')` "compiles and enforces
> nothing" until replaced. Checked `src/api/auth/guards/roles.guard.ts` directly: it already
> matches on the single `user.role` (the schema's actual `user_role` enum), with correct OR logic
> and platform-admin tokens failing closed. This module's own [Gap
> section](./overview.md#gap-between-current-code-and-target-design) already says as much for the
> shipped blocklist routes ("`@Roles('owner')` is enforced — `RolesGuard` reads the JWT `role`");
> this paragraph just hadn't been updated to match. No guard fix is a prerequisite for anything in
> this document.

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

**The row must already exist**, since classification cannot run without it — which is exactly why
`PLAN.md` §8.10 puts `INSERT tenant_settings` inside the signup transaction alongside `tenants` and
`users`. The *value* needs no help: `escalation_rating_threshold` is `NOT NULL DEFAULT 3`
(`0002_tenant_auth.sql`), so signup omits the column and inherits it, while `auto_post_enabled = false`
is still written explicitly because "never post without a human in the MVP" is an app-level
guarantee. Neither route below creates the row. Both `404` if it is missing.

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
  "aiReplyCount": 1,
  "updatedAt": "2026-08-28T09:12:44Z"
}
```

| Field | Type | Source |
|---|---|---|
| `id` | string (uuid) | `tenant_settings.id` |
| `escalationRatingThreshold` | integer 1–5 | `tenant_settings.escalation_rating_threshold` |
| `autoPostEnabled` | boolean | `tenant_settings.auto_post_enabled` |
| `reviewDataRetentionMonths` | integer \| null | `tenant_settings.review_data_retention_months` — `null` means the nightly reviewer-retention purge (`PLAN.md` §6) skips this tenant entirely; there is no platform-default fallback, so `null` is functionally "keep indefinitely until this is set," not "use some other number" |
| `aiReplyCount` | integer 1–3 | `tenant_settings.ai_reply_count` |
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

**`aiReplyCount` is part of this contract.** `tenant_settings.ai_reply_count`
(`SMALLINT NOT NULL DEFAULT 1`, `CHECK (BETWEEN 1 AND 3)`, `0002_tenant_auth.sql:106`) backs the
Settings → AI tab's 1–3 reply-count select, and `UpdateTenantSettingsDto.aiReplyCount` is
**required** on this route, mirroring the DB check exactly (a bad value is a `400`, never a
constraint violation). A database that predates that column addition fails this route outright
with `column "ai_reply_count" does not exist` — recreate it (`pnpm db:dev:rm && pnpm db:dev:up`,
then `pnpm db:migrate`); `db:migrate` alone reports success and changes nothing, since Drizzle
never re-reads an applied migration.

**`PUT`, not `PATCH`.** Three fields today, all always rendered and always populated on the one form that
writes them, and the frontend already models the save as a full-resource write
(`SettingsService.updateSettings` — "mocks a full-resource PUT"). A `PATCH` variant would add a
second contract, and a second set of "absent vs. explicitly null" rules, for a resource where the
client always holds the complete state. The one place that matters: **omitting
`reviewDataRetentionMonths` stores `NULL`**, which is the intended way to opt this tenant back out
of the nightly reviewer-retention purge entirely (`PLAN.md` §6 — there is no platform-default
fallback to hand it back to) — the only field where absence is meaningful rather than a validation
error.

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
  "reviewDataRetentionMonths": 24,
  "aiReplyCount": 1
}
```

| Field | Type | Rules |
|---|---|---|
| `escalationRatingThreshold` | integer | required, `1`–`5` inclusive — mirrors `tenant_settings_escalation_rating_threshold_check` exactly, so a bad value is a `400` and never a database constraint violation. Matches the frontend slider's `min=1 max=5 step=1`. |
| `autoPostEnabled` | boolean | required. Persisted as sent. After a human approval, `true` moves the response `approved → posted` without a second click. |
| `reviewDataRetentionMonths` | integer \| null | optional; `>= 1` when present, capped at Postgres's own `INTEGER` ceiling (2147483647) — no product-level bound, a very large value is functionally "keep indefinitely" and is the tenant's call, but a value past what the column can hold is rejected as a `400` instead of reaching the database uncaught. Omitted or `null` → stored as `NULL`, which opts this tenant out of the nightly reviewer-retention purge (`PLAN.md` §6) entirely — there is no platform-default fallback. |
| `aiReplyCount` | integer | required, `1`–`3` inclusive — mirrors `tenant_settings_ai_reply_count_check` exactly. How many AI-drafted reply variants the generation pipeline produces per review, escalated or not; the AI tab's select. A review that is auto-posted (`autoPostEnabled`, not escalated) gets one draft, since no one picks between them. |

**On `autoPostEnabled`.** The value is persisted and nothing reads it yet — the posting pipeline
ships separately. When it lands, approval will still be required; the flag only skips a second
manual post step. GBP delivery is not part of this endpoint either way.

Success `200` — the stored resource, same shape as [`GET /v1/settings`](#get-v1settings):

```json
{
  "id": "0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33",
  "escalationRatingThreshold": 3,
  "autoPostEnabled": false,
  "reviewDataRetentionMonths": 24,
  "aiReplyCount": 1,
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

Returns every term the tenant has. Removal is a hard `DELETE`, so there is no inactive state to
filter on and no query parameters. Ordered by `lower(term) ASC`, matching the unique index, so the
order is stable and index-served rather than sorted.

Success `200`:

```json
{
  "items": [
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8", "term": "food poisoning", "createdAt": "2026-08-11T10:04:19Z" },
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2d9", "term": "health inspector", "createdAt": "2026-08-11T10:04:31Z" },
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2da", "term": "lawsuit", "createdAt": "2026-08-11T10:03:52Z" },
    { "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2db", "term": "lawyer", "createdAt": "2026-08-11T10:04:07Z" }
  ],
  "total": 4
}
```

| Field | Type | Source |
|---|---|---|
| `items[].id` | string (uuid) | `blocklist_terms.id` |
| `items[].term` | string | `blocklist_terms.term` — stored verbatim, with original casing |
| `items[].createdAt` | string (ISO 8601) | `blocklist_terms.created_at` |
| `total` | integer | Count of returned rows. Not paginated — a keyword blocklist is tens of rows, not thousands; `total` is there so the shape does not have to change if pagination is ever added. |

Errors: `401`, `403` (member), `500`.

### `POST /v1/settings/blocklist-terms`

Adds a term. Backs the Blocklist tab's add-term input.

**Duplicates are decided by the database, with no read-then-write window:**

```sql
INSERT INTO blocklist_terms (tenant_id, term)
VALUES ($1, $2)
ON CONFLICT (tenant_id, lower(term)) DO NOTHING
RETURNING id, term, created_at;
```

Two outcomes: a brand-new row → `201`; a term the tenant already has, in any casing → zero rows
return and the service raises `409 BLOCKLIST_TERM_EXISTS`. The `409` is the right answer — the term
is already doing exactly what the owner is asking for.

There is no reactivation path, because removal is a hard `DELETE` rather than a soft one. That is
deliberate: `reviews.matched_keywords` stores matched terms as JSONB text with no foreign key — so
removing a term never orphans the escalation it caused.

Request:

```json
{
  "term": "food poisoning"
}
```

| Field | Type | Rules |
|---|---|---|
| `term` | string | required, trimmed, 1–255 chars (`VARCHAR(255) NOT NULL`), non-empty after trimming and containing at least one visible character (a zero-width-only term is rejected). Stored with the casing sent; matched case-insensitively. Multi-word phrases are valid — the client's own blocklist contains "food poisoning" and "health inspector". No `match_type` is accepted: `PLAN.md` §2 lists `exact`/`contains`/`regex` as a possible fast-follow, explicitly not MVP, so match semantics are the classifier's and not stored per term. |

Success `201`:

```json
{
  "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2d8",
  "term": "food poisoning",
  "createdAt": "2026-09-04T11:06:12Z"
}
```

Errors: `400` validation, `401`, `403` (member), `409 BLOCKLIST_TERM_EXISTS`, `409 BLOCKLIST_LIMIT_REACHED`, `500`.

**Limit.** A tenant's blocklist holds at most **100** terms (`MAX_BLOCKLIST_TERMS_PER_TENANT`) — the classifier scans every term against every new review, and the list previously grew without bound. The count and the insert run in one transaction behind a per-tenant advisory lock, so concurrent adds cannot both slip under the cap. A term the tenant already has still answers `409 BLOCKLIST_TERM_EXISTS` when the list is full; only a genuinely new term gets `BLOCKLIST_LIMIT_REACHED`.

### `PATCH /v1/settings/blocklist-terms/:id`

Renames a term. **Spec-only — no screen calls this and it is not implemented**; the Blocklist tab
offers add and remove only.

It used to also flip `is_active`, justified by that being "the column `PLAN.md` §3 filters on."
That was never true — no code path ever wrote or read it — so the column was dropped from
`blocklist_terms` rather than wired up, and muting a term is not a feature. A term you no longer
want is deleted.

Renaming re-enters the same case-insensitive unique index as `POST`, so a rename onto an existing
term is a `409`. Unlike `POST`, a rename does **not** absorb the colliding row — merging two terms
by renaming is data loss disguised as an edit; delete one and rename the other.

Request:

```json
{
  "term": "lawsuit threat"
}
```

| Field | Type | Rules |
|---|---|---|
| `term` | string | required; same rules as `POST` — trimmed, 1–255 chars, non-empty |

An empty body is `400 NO_FIELDS_TO_UPDATE` rather than a no-op `200`: a client that sent nothing
meant to send something.

Success `200`:

```json
{
  "id": "0190f3c1-0a12-7b40-9e63-11c4a7f0b2da",
  "term": "lawsuit threat",
  "updatedAt": "2026-09-04T11:08:40Z"
}
```

Errors: `400` validation, `400 NO_FIELDS_TO_UPDATE`, `401`, `403` (member),
`404 BLOCKLIST_TERM_NOT_FOUND`, `409 BLOCKLIST_TERM_EXISTS`, `500`.

### `DELETE /v1/settings/blocklist-terms/:id`

Removes a term permanently. Backs the chip's X button in the Blocklist tab.

**A hard `DELETE`, and there is no soft-delete alternative** — the `is_active` column that would
have provided one has been dropped. Two reasons, and neither is convenience. First, the UI's
affordance is a removal, not a mute — leaving a soft-deleted row behind would make the next
`POST` of the same word return `200 reactivated: true` for something the owner believes they
deleted. Second, deleting the row does not destroy the history of why a past review escalated:
`reviews.matched_keywords` stores the matched term text on the review itself (`PLAN.md` §2,
`reviews`), independent of whether the blocklist term that caused it still exists.

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

| Method | Path | Auth | Status |
|---|---|---|---|
| `GET` | `/v1/settings/notification-recipients` | Bearer, `@Roles('owner')` | **Building now** |
| `PATCH` | `/v1/settings/notification-recipients/:id` | Bearer, `@Roles('owner')` | **Building now** |
| `POST` | `/v1/settings/notification-recipients` | Bearer, `@Roles('owner')` | Deferred |
| `DELETE` | `/v1/settings/notification-recipients/:id` | Bearer, `@Roles('owner')` | Deferred |

**`GET` and `PATCH` are this pass's scope** — list recipients and edit an existing one's `channel`/
`isActive`, matching exactly what the shipped Settings UI does today (a fixed list with per-row
edits, no add/remove control). `POST`/`DELETE` stay deferred, per [MVP
scope](./overview.md#mvp-scope)'s own note that no screen calls them yet.

**Seeding, since nothing else does:** no code anywhere writes `notification_recipients` today (no
signup flow, no admin action, nothing) — confirmed by grepping the backend for inserts into it.
Without at least one row, `PATCH` has nothing to edit and the Settings tab stays permanently empty
regardless of how correct the API is. This pass adds exactly one seed: the tenant's self-signup
transaction (§4.3a — the same one that already creates `tenant_settings` alongside `tenants` and
the owner's `users` row, per §8.10) also inserts one `notification_recipients` row for that new
owner (`notification_type = 'escalation'`, `channel = 'email'`, `is_active = true`). That's the
only way a row comes to exist until `POST` is built.

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
      "initials": "MD",
      "channel": "both",
      "isActive": true
    }
  ]
}
```

| Field | Type | Source |
|---|---|---|
| `items[].id` | string (uuid) | `notification_recipients.id` — the id the `PATCH` below takes, **not** the user's id |
| `items[].userId` | string (uuid) | `notification_recipients.user_id` |
| `items[].name` | string | `users.name` (joined) |
| `items[].initials` | string | Derived server-side from `users.name` (`initials.util.ts`) — see the note above on why the frontend consumes this rather than computing it |
| `items[].channel` | enum | `notification_recipients.channel` (`notification_channel_pref`: `email` \| `teams` \| `both`) |
| `items[].isActive` | boolean | `notification_recipients.is_active` — `false` means configured but not delivered to |

> **Corrected (implementation pass).** This previously documented `items[].email`,
> `items[].notificationType`, `items[].createdAt` and a top-level `total`, and omitted the
> `initials` the route actually returns. `NotificationRecipientDto` returns the six fields above
> and nothing else — the settings UI renders a name, initials, a channel and a toggle, and none
> of the other four had a consumer. `total` went with them: the list is not paginated, so it was
> just `items.length` under another name.

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
  "initials": "MD",
  "channel": "email",
  "isActive": true
}
```

The updated recipient, in exactly the same shape as one `items[]` entry from the `GET` above —
which is what lets the client reconcile its cache from this response instead of refetching the
list. `notification_recipients.updated_at` **is** advanced by this write; it just isn't returned,
because no screen shows it.

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

## Team members

| Method | Path | Auth |
|---|---|---|
| `GET` | `/v1/settings/members` | Bearer, `@Roles('owner')` |
| `POST` | `/v1/settings/members` | Bearer, `@Roles('owner')` |
| `DELETE` | `/v1/settings/members/:memberId` | Bearer, `@Roles('owner')` |
| `POST` | `/v1/settings/members/:memberId/request-removal` | Bearer, `@Roles('owner')` |
| `POST` | `/v1/settings/members/:memberId/cancel-removal` | Bearer, `@Roles('owner')` |

The tenant-owner-facing roster: invite a teammate, revoke a pending invite, and — the two routes
this pass adds — request or cancel the removal of an already-accepted member. There is no `tenant
_member_invites` table: an invite's token lives on `password_reset_tokens` (`purpose = 'invite'`),
and the invited person is a real `users` row from the moment the invite is sent
(`status = 'invited'`), not a separate pending record — see
`apps/documentation/docs/backend/auth/tenant-member-invite-design.md` for why. This module reads
and writes that same `users` row through `AuthRepository`/`AuthDbService` (`src/db/repositories/
auth/`) — there is no settings-local member repository, since the auth module already owns `users`.

Every route in this section requires `@Roles('owner')` with no exception — see [Role
requirements](#role-requirements). Accepting an invite (by password or Google SSO) is a `@Public()`
route on the auth module, not here — the invitee has no session yet, so it cannot live behind this
controller's guard. See [Auth Module — API Reference](../auth/api-reference.md) for
`POST /v1/auth/invite/accept` and `GET /v1/auth/invite/:token/google`.

### `GET /v1/settings/members`

Lists the tenant's roster — every non-anonymized `users` row for the tenant, owner and members and
pending invites alike. Backs the Team tab's member list.

Success `200`:

```json
{
  "items": [
    {
      "id": "0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f",
      "name": "Maria Delgado",
      "email": "maria@thecoastaltable.com",
      "role": "owner",
      "status": "active",
      "invitedAt": "2026-02-01T09:00:00.000Z",
      "erasureRequestedAt": null
    },
    {
      "id": "0190f3c9-5b7e-7d2a-8a44-2f6a5c8d1e04",
      "name": "sam.rivera@thecoffeehouse.com",
      "email": "sam.rivera@thecoffeehouse.com",
      "role": "member",
      "status": "invited",
      "invitedAt": "2026-03-01T09:12:00.000Z",
      "erasureRequestedAt": null
    }
  ]
}
```

| Field | Type | Source |
|---|---|---|
| `items[].id` | string (uuid) | `users.id` |
| `items[].name` | string | `users.name` — before an invite is accepted this is the invited email address, since the invitee chooses their own display name on the accept screen, not the owner on the invite form |
| `items[].email` | string | `users.email` |
| `items[].role` | enum | `users.role` (`owner` \| `member`) |
| `items[].status` | enum | `users.status` (`user_status`: `invited` \| `pending_verification` \| `active` \| `disabled`) |
| `items[].invitedAt` | string (ISO 8601) | `users.created_at` — the owner's own row (created at signup, never invited) uses its own `createdAt` under the same field name |
| `items[].erasureRequestedAt` | string (ISO 8601) \| null | `users.erasure_requested_at` — set once removal has been requested for this member, `null` means no removal is pending. Combine with `ERASURE_GRACE_PERIOD_DAYS` to show when it takes effect |

Errors: `401`, `403` (member), `500`.

### `POST /v1/settings/members`

Invites a teammate by email. Backs the Team tab's invite form.

Refused up front, before any DB write, in two independent ways: `403 MEMBER_INVITES_DISABLED` if
the platform-wide `platform_settings.invite_members_enabled` switch is off, and
`403 TEAM_MEMBER_LIMIT_REACHED` if this tenant's plan has hit its team-member cap
(`BillingEntitlementsService.canInviteTeamMember`) — two different exceptions on purpose, since the
frontend shows different upsell copy for each ("invites are off for this platform" vs. "your plan
caps team members at N").

`email` is checked against the **global** `idx_users_email_active` unique index, not a tenant-scoped
one — one non-anonymized account per email address across the whole product, so an address already
claimed by this tenant's own owner, a member of an unrelated tenant, or a self-signed-up account is
refused before the insert rather than surfacing as a raw `23505`. A **lapsed** invite (still
`status = 'invited'` but past its 7-day token expiry, or with no token row left at all — the nightly
token-cleanup sweep purges expired invite tokens while leaving the `users` row behind) is not
treated as a live claim: re-inviting deletes the stale row and its token, then proceeds as a fresh
invite. A still-live invite is `409 MEMBER_EMAIL_ALREADY_INVITED`; an address that belongs to an
already-active account anywhere is `409 EMAIL_ALREADY_REGISTERED`.

Request:

```json
{
  "email": "sam.rivera@thecoffeehouse.com"
}
```

| Field | Type | Rules |
|---|---|---|
| `email` | string | required, valid email, normalized (case/whitespace) before comparison |

Success `201` — the new roster row, same shape as one `items[]` entry from `GET` above:

```json
{
  "id": "0190f3c9-5b7e-7d2a-8a44-2f6a5c8d1e04",
  "name": "sam.rivera@thecoffeehouse.com",
  "email": "sam.rivera@thecoffeehouse.com",
  "role": "member",
  "status": "invited",
  "invitedAt": "2026-03-01T09:12:00.000Z",
  "erasureRequestedAt": null
}
```

Errors: `400` validation, `401`, `403` (member), `403 MEMBER_INVITES_DISABLED`,
`403 TEAM_MEMBER_LIMIT_REACHED`, `409 MEMBER_EMAIL_ALREADY_INVITED`, `409 EMAIL_ALREADY_REGISTERED`,
`500`.

### `DELETE /v1/settings/members/:memberId`

Revokes a **pending invite** — not a general "remove this member" route. Backs the roster row's
revoke action while `status = 'invited'`.

The two failure modes answer differently on purpose: an unknown id is `404`, while an id that
exists but is no longer `invited` (already accepted) is `409` — the member is still visible in the
roster, so "not found" would describe something the owner can plainly see is there. To remove an
already-accepted member, use [`POST .../request-removal`](#post-v1settingsmembersmemberidrequest-removal)
below instead — this route never touches an active member.

No request body.

| Field | Type | Rules |
|---|---|---|
| `memberId` (path) | string (uuid) | required, must be a `users` row belonging to the caller's tenant |

Success `200`:

```json
{
  "message": "Invite revoked."
}
```

Errors: `401`, `403` (member), `404 MEMBER_NOT_FOUND`, `409 MEMBER_INVITE_NOT_REVOCABLE`, `500`.

### `POST /v1/settings/members/:memberId/request-removal`

Requests removal of an already-accepted team member. Backs the roster row's "Remove" action once a
member is no longer just a pending invite.

**Revokes access immediately, defers the actual data erasure.** On success the target's
`status` flips to `disabled` (they can no longer sign in) and `erasure_requested_at` is set to
`now()` — nothing is anonymized yet. A separate nightly cron job (`CronJobName.ERASURE_PURGE` —
see [Review pipeline — Retention and erasure
jobs](../review-pipeline/overview.md#retention-and-erasure-jobs)) anonymizes the member's `name`/
`email`/`password_hash` once `ERASURE_GRACE_PERIOD_DAYS` (default 21) has elapsed, unless the owner
cancels first via the route below.

Two guards refuse the request outright, before any row is touched:

- **`memberId === ` the caller's own id → `400 CANNOT_REMOVE_SELF`.** An owner never removes
  themself through this flow — checked first, with no DB round trip, since it needs no lock or
  last-owner count.
- **The target is this tenant's last remaining owner → `400 CANNOT_REMOVE_LAST_OWNER`.** Counted
  under a per-tenant advisory lock (`pg_advisory_xact_lock(hashtext('tenants:owner-guard'),
  hashtext(tenantId))`) so two concurrent removal requests against a tenant's last two owners can't
  both read "at least one other owner exists" and both succeed, leaving the tenant ownerless. The
  lock is keyed per-tenant (mirroring `ConnectionsRepository.acquireLocationConfirmLock`'s and
  `TenantSubscriptionsRepository.acquireCheckoutLock`'s existing per-tenant lock shape), so two
  unrelated tenants' removal requests never serialize against each other.

No request body.

| Field | Type | Rules |
|---|---|---|
| `memberId` (path) | string (uuid) | required, must be a `users` row belonging to the caller's tenant |

Success `200` — the response message interpolates the configured grace period so the owner sees
exactly how long they have to change their mind:

```json
{
  "message": "Removal requested. This member loses access now, and their data is permanently erased in 21 days unless you cancel first."
}
```

Errors: `401`, `403` (member), `400 CANNOT_REMOVE_SELF`, `400 CANNOT_REMOVE_LAST_OWNER`,
`404 MEMBER_NOT_FOUND`, `500`.

### `POST /v1/settings/members/:memberId/cancel-removal`

Undoes `request-removal` — a clean, full undo, since nothing is anonymized until the grace period
actually elapses. Clears `erasure_requested_at` and restores the status the member had before the
request: `active` for someone who has signed in, `invited` for an invitee who never accepted
(`email_verified_at IS NULL`). Restoring `active` for the second kind would have turned a pending
invite into a live account with no verified email, and removed it from the invite-revoke path.

The fallback existence-check that distinguishes the two error cases below also excludes
already-anonymized rows: if the nightly purge already ran for this member (`anonymized_at` set)
before the owner clicked cancel, this resolves to `404 MEMBER_NOT_FOUND` rather than the misleading
`409 MEMBER_REMOVAL_NOT_PENDING` — there is no pending removal left to cancel because the member is
already gone, not because the request was never made.

No request body.

| Field | Type | Rules |
|---|---|---|
| `memberId` (path) | string (uuid) | required, must be a `users` row belonging to the caller's tenant |

Success `200`:

```json
{
  "message": "Removal cancelled — this member keeps their access."
}
```

Errors: `401`, `403` (member), `404 MEMBER_NOT_FOUND`, `409 MEMBER_REMOVAL_NOT_PENDING`, `500`.

## Platform config

### `GET /v1/settings/platform-config`

Public (`@Public()`): the sign-in and sign-up screens read it before a session exists. The same shape is returned by the admin-only
`PATCH /v1/admin/settings/platform` that changes the toggles.

| Field | Type | Source |
|---|---|---|
| `microsoftLoginEnabled` | boolean | `platform_settings.microsoft_login_enabled` — whether the Microsoft sign-in button is offered (formerly `ssoLoginEnabled` / `sso_login_enabled`) |
| `passwordLoginEnabled` | boolean | `platform_settings.password_login_enabled` — whether new email/password sign-ups are offered. While it is off `POST /v1/auth/signup` answers 403 `PASSWORD_SIGNUP_DISABLED`. It does not affect existing password sign-in, password changes or invites |
| `googleLoginEnabled` | boolean | `platform_settings.google_login_enabled` — whether Google sign-in is offered to tenants (formerly `socialLoginEnabled` / `social_login_enabled`). While it is off the tenant Google routes (login, sign-up and invite authorize and callback) answer `NOT_CONFIGURED`; platform-admin Google sign-in and admin invites are never affected |
| `inviteMembersEnabled` | boolean | `platform_settings.invite_members_enabled` — whether Settings → Members can send invites |
| `notificationSettingsEnabled` | boolean | `platform_settings.notification_settings_enabled` — whether Settings shows the Notifications tab and the notification-recipients routes answer. Defaults to `false`. Writing `true` is refused with 422 `NOTIFICATION_CHANNELS_NOT_IMPLEMENTED` until email/Teams delivery exists; while it is off the recipients routes answer 403 `NOTIFICATION_SETTINGS_DISABLED` |
| `paymentFeatureEnabled` | boolean | The deploy's `PAYMENT_FEATURE_ENABLED` env var, not a column |
| `erasureGracePeriodDays` | number | The deploy's `ERASURE_GRACE_PERIOD_DAYS` env var (default 21), not a column. Days between a business or member being scheduled for erasure and the nightly purge anonymising it; the web app counts its "takes effect on" dates from it |
| `adminMicrosoftLoginAvailable` | boolean | Derived from the environment, not a column: the Microsoft client (`MICROSOFT_CLIENT_ID`/`_SECRET`/`_CALLBACK_URL`) is configured **and** `ADMIN_MICROSOFT_TENANT_ID` pins the Entra directory platform admins sign in from. Whether the admin sign-in page offers "Continue with Microsoft" (sign-in only; admins are invite-only). Independent of `microsoftLoginEnabled`, which governs tenant sign-in |

## Data export

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/settings/export` | Bearer, `@Roles('owner')` | 3 / min |

### `GET /v1/settings/export`

Downloads a copy of the business's own data as one JSON file — the portability half of deletion: an
owner can take everything with them *before* scheduling it (the Delete business dialog offers it).
**Not** wrapped in the usual response envelope: the body is the file, `Content-Type:
application/json`, `Content-Disposition: attachment; filename="innopeak-export-<business>-<YYYY-MM-DD>.json"`.
Owner only; a member — or an owner an admin has disabled — gets `403`. Not available once the business is suspended (including while an
erasure is pending), since nobody can sign in then.

The body is **streamed** — reviews are read 500 at a time and written out as they arrive — so memory
stays flat however many reviews a business has.

```json
{
  "format": "innopeak-export",
  "version": 1,
  "exportedAt": "2026-10-07T09:30:00.000Z",
  "business": { "name": "Acme Dental", "status": "active", "createdAt": "2026-03-02T10:00:00.000Z" },
  "team": [{ "name": "Jane Owner", "email": "jane@acme.test", "role": "owner", "status": "active", "createdAt": "..." }],
  "settings": { "escalationRatingThreshold": 3, "autoPostEnabled": false, "reviewDataRetentionMonths": null, "aiReplyCount": 1 },
  "blocklist": ["refund", "lawsuit"],
  "notificationRecipients": [{ "email": "jane@acme.test", "notificationType": "escalation", "channel": "email", "isActive": true }],
  "locations": [{ "id": "…", "name": "Acme Dental – Main", "address": "…", "provider": "google", "status": "active", "createdAt": "…" }],
  "prompts": [{ "category": "…", "name": "…", "description": null, "tone": "professional", "versions": [{ "version": 1, "template": "…", "createdAt": "…" }] }],
  "reviews": [{
    "id": "…", "locationId": "…", "rating": 5, "text": "…", "reviewerName": "A. Customer",
    "reviewedAt": "…", "sentiment": "positive", "classification": "auto_reply", "status": "responded",
    "responses": [{ "type": "reply", "content": "…", "source": "ai", "status": "posted", "postedAt": "…", "createdAt": "…" }]
  }],
  "billing": { "plan": "paid", "status": "active", "currentPeriodEnd": "…", "receipts": [{ "invoiceNumber": "…", "amountPaid": 4900, "currency": "usd", "paidAt": "…" }] }
}
```

What is **in** it: what the business entered or produced — team, settings, blocklist, recipients,
locations, prompts, reviews with every reply (drafts and rejected ones too, tagged by `status`), and
billing receipts. What is **deliberately left out**: anything that is a credential or internal
machinery — password hashes, tokens, the Google connection and its stored credential, Stripe ids,
sync runs, generation metadata and error text, in-app notification rows. A reviewer's name is
`null` once it has been anonymized by the retention job. Amounts are in the smallest currency unit.

Errors: `401`, `403`, `429`.

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
| `403` | `TENANT_SUSPENDED` | Every route | `tenants.status = 'suspended'`. A token issued before the suspension is refused too: suspending a business marks it in Redis and every older access token stops working at once (see auth's `SessionRevocationService`). |
| `404` | `TENANT_SETTINGS_MISSING` | `GET /v1/settings`, `PUT /v1/settings` | No `tenant_settings` row for this tenant — a tenant provisioned outside `PLAN.md` §8.10's signup transaction. Neither route creates it; see [`GET /v1/settings`](#get-v1settings). |
| `404` | `BLOCKLIST_TERM_NOT_FOUND` | `PATCH`/`DELETE /v1/settings/blocklist-terms/:id` | No such term **for this tenant**. Also returned for a term that exists under a different tenant — `403` there would confirm the id exists. |
| `404` | `RECIPIENT_NOT_FOUND` | `PATCH`/`DELETE /v1/settings/notification-recipients/:id` | Same rule, for `notification_recipients.id`. |
| `404` | `USER_NOT_FOUND` | `POST /v1/settings/notification-recipients` | `userId` is not a `users` row in the caller's tenant. Same non-confirmation reasoning. |
| `400` | `CANNOT_REMOVE_SELF` | `POST /v1/settings/members/:memberId/request-removal` | `memberId` is the caller's own id — an owner never removes themself through this flow. |
| `400` | `CANNOT_REMOVE_LAST_OWNER` | `POST /v1/settings/members/:memberId/request-removal` | The target is this tenant's last remaining owner (`role='owner' AND anonymized_at IS NULL`), counted under a per-tenant advisory lock. |
| `403` | `MEMBER_INVITES_DISABLED` | `POST /v1/settings/members` | The platform-wide `platform_settings.invite_members_enabled` switch is off. |
| `403` | `TEAM_MEMBER_LIMIT_REACHED` | `POST /v1/settings/members` | This tenant's plan has hit its team-member cap (`BillingEntitlementsService.canInviteTeamMember`). |
| `404` | `MEMBER_NOT_FOUND` | `DELETE /v1/settings/members/:memberId`, `POST .../request-removal`, `POST .../cancel-removal` | No such `users` row for this tenant — or, for cancel-removal specifically, a row that exists but was already anonymized by the nightly purge (deliberately collapsed into the same `404`, not a misleading `409`). |
| `409` | `MEMBER_EMAIL_ALREADY_INVITED` | `POST /v1/settings/members` | This email already has a live, unexpired pending invite. |
| `409` | `EMAIL_ALREADY_REGISTERED` | `POST /v1/settings/members` | This email belongs to an already-active account anywhere in the product (global `idx_users_email_active`). |
| `409` | `MEMBER_INVITE_NOT_REVOCABLE` | `DELETE /v1/settings/members/:memberId` | The id exists but is no longer `invited` (already accepted) — nothing left to revoke. |
| `409` | `MEMBER_REMOVAL_NOT_PENDING` | `POST /v1/settings/members/:memberId/cancel-removal` | The target has no pending removal (`erasure_requested_at IS NULL`) to cancel. |
| `409` | `BLOCKLIST_LIMIT_REACHED` | `POST /v1/settings/blocklist-terms` | The tenant already has 100 terms. Remove one first. |
| `409` | `BLOCKLIST_TERM_EXISTS` | `POST /v1/settings/blocklist-terms`, `PATCH /v1/settings/blocklist-terms/:id` | `lower(term)` collides with an existing row (`idx_blocklist_terms_tenant_id_lower_term`). `POST` has no reactivation path — removal is a hard `DELETE`, so every collision is a `409`. |
| `409` | `RECIPIENT_ALREADY_EXISTS` | `POST /v1/settings/notification-recipients` | This user is already a recipient for this `notification_type`. Application-enforced until the unique index above is migrated, and therefore racy under concurrent submits. |
| `429` | `Too Many Requests` | Every route | The global `short` tier (30 / minute); `GET /export` has its own 3 / minute. |
| `500` | `Internal Server Error` | Every route | Unhandled exception. Only `traceId` is safe to show the user. A CHECK-constraint violation reaching here (rather than surfacing as `400`) means DTO validation drifted from the schema — treat it as a bug in the DTO, not in the caller. |

No route in this module returns `422`, and none returns `204`: every success carries a body so the
standard envelope always has something to wrap.
