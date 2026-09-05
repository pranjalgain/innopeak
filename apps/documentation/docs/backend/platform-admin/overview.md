---
sidebar_position: 1
---

# Platform Admin Module

## Overview

The platform-admin module is the only module in this backend whose principal is **not** scoped to
a tenant. It exists for GeekyAnts-side support and ops staff: see every tenant on the platform,
inspect one tenant's health when a customer files a ticket, suspend a tenant that has to be cut
off, provision a tenant on a customer's behalf during assisted onboarding, and read
cross-tenant aggregate metrics. `PLAN.md` §2's `platform_admins` subsection scopes it exactly this
narrowly — "platform-level administration (support access into a tenant, disabling/suspending a
tenant, cross-tenant visibility/metrics)" — and explicitly removes it from the tenant/owner
provisioning path, which is self-service (§4.3a). Provisioning a tenant is the documented
*exception*, not the primary flow.

**Why platform admins are a separate hierarchy, not a role on `users`.** This is the design
decision the entire module rests on, and it is a schema decision, not a code-style preference.
`PLAN.md` §2 states it directly: modeling the platform admin separately "keeps `users.tenant_id`
always `NOT NULL` and every tenant-scoped query safely assumable as single-tenant, rather than
needing to defensively handle a nullable-tenant 'super user' row mixed into the same table." The
migrations follow through on that literally — `users.tenant_id` is `UUID NOT NULL REFERENCES
tenants(id)` in `0002_tenant_auth.sql`, and `platform_admins` in `0001_platform_admin.sql` has no
FK to any tenant table at all (that file's own header comment says so). The payoff is that no
repository method in any other module ever has to ask "is this caller a super user?" before
applying its `tenant_id` filter. The cost lands entirely here: a cross-tenant principal now has
**no** natural place in the tenant data model, which is why [Tenant scoping and
attribution](#tenant-scoping-and-attribution) is the longest section in this document rather than
a footnote.

**Authentication is not in this module.** Platform-admin login, invites, invite acceptance
(password and SSO), refresh, logout, and `me` are already fully specified in the auth module — see
[Auth Module — API Reference](../auth/api-reference.md#platform-admin-api) for the
`/v1/platform-admin/auth/...` routes and [Auth Module — Overview](../auth/overview.md) for the
session/token model behind them. This module documents only the *operations* surface layered on
top of an already-authenticated platform-admin session. Where the two touch — the invite that
support-assisted provisioning sends, the `type` claim that separates the two token kinds — this
document cross-references rather than restates, so the two can't drift apart.

For the endpoint-by-endpoint contract, see [Platform Admin Module — API
Reference](./api-reference.md).

## Data model

This module owns three tables outright and reads or writes a handful of others that belong to
other modules. Column-level detail lives in the migrations; this table is the map.

| Table | Purpose |
|---|---|
| `platform_admins` | The support/ops staff account. `id`, `email`, `password_hash` (nullable — SSO-only admins have none), `invited_by_platform_admin_id` (nullable self-FK, `ON DELETE SET NULL`), `status` (`platform_admin_status`), `created_at`, `updated_at`. **No `role` column and no `name` column** — a flat hierarchy, differentiated only by invite lineage. Unique index on `email`; partial unique index `idx_platform_admins_single_root ON platform_admins((TRUE)) WHERE invited_by_platform_admin_id IS NULL` enforces **at most** one root admin — zero also satisfies it, which is why the root has to be seeded (`0001_platform_admin.sql:29-31`). |
| `platform_admin_identities` | One row per (admin, external provider). `platform_admin_id`, `provider` (`user_identity_provider`), `provider_user_id`. Unique on `(provider, provider_user_id)`. Unlike `user_identities`, it has **no `email` column**. Owned by the auth module; this module only reads it to show how an admin signs in. |
| `platform_admin_invites` | One-time tokens for admin invite and password reset. `platform_admin_id`, `token_hash`, `purpose` (`platform_admin_invite_purpose`), `expires_at`, `used_at`. Unique on `token_hash`. Owned entirely by the auth module — this module never writes it. |
| `tenants` | **The one cross-tenant table this module writes.** `id`, `name`, `created_by_platform_admin_id` (nullable FK → `platform_admins`, `ON DELETE SET NULL`), `status` (`tenant_status`, default `pending_activation`). Indexed on `status` and on `created_by_platform_admin_id`. Suspension writes `status`; provisioning writes the whole row including `created_by_platform_admin_id`. |
| `users` | Read for the tenant-inspection view (who owns this tenant, how many members, what state are they in). Written once, on support-assisted provisioning, to create the invited owner row — `role = 'owner'`, `status = 'invited'`, `invited_by_user_id = NULL` (`PLAN.md` §4.3d; that column is a self-FK to `users`, so it cannot point at a `platform_admins` row). |
| `password_reset_tokens` | Written once, on support-assisted provisioning, with `purpose = 'invite'`. The token's *mechanics* are the auth module's — see [`POST /v1/auth/invite/accept`](../auth/api-reference.md#post-v1authinviteaccept). |
| `tenant_settings` | Written once, on provisioning, because `escalation_rating_threshold` is `NOT NULL` with no default and classification depends on the row existing (`PLAN.md` §8.10). Read-only otherwise. |
| `review_provider_connections`, `locations`, `sync_runs` | Read-only, for the connection/sync health shown in tenant inspection and platform metrics. `review_provider_connections.status` (`google_connection_status`) and `locations.last_synced_at` / `last_sync_status` / `last_sync_error` are the health signals; see [Connections Module](../connections/overview.md). |
| `reviews` | Read-only, aggregate only — counts by `status` and `classification` for the metrics overview. Never row-level: a platform admin has no business reading `reviewer_name` or `review_text` out of the metrics path. |
| `audit_logs` | Written **implicitly** by the `log_db_changes()` trigger on every table this module touches, never by application code. Read by nothing in this module today. See [Tenant scoping and attribution](#tenant-scoping-and-attribution) for what it can and cannot attribute. |

The enums that matter here, all declared in `0000_foundation.sql`:

- **`platform_admin_status`** — `invited` \| `active` \| `disabled`. `invited` is the pre-acceptance
  state the auth module's invite flow creates (`PLAN.md` §4.3c); `disabled` is what this module's
  admin-management endpoints write. There is no `suspended` value and no soft-delete — a departed
  admin is `disabled`, and the row survives so `invited_by_platform_admin_id` lineage and
  `tenants.created_by_platform_admin_id` stay resolvable.
- **`platform_admin_invite_purpose`** — `invite` \| `reset`. Deliberately narrower than
  `token_purpose` (`verify_email` \| `invite` \| `reset`): an admin never self-registers, so
  there is no email to verify. Auth's surface, listed here only so the asymmetry isn't mistaken
  for an omission.
- **`tenant_status`** — `pending_activation` \| `active` \| `suspended`. All three are load-bearing
  for this module and the distinction between the first two is easy to lose; see [Operations
  flows](#operations-flows).
- **`audit_operation_type`** — `INSERT` \| `UPDATE` \| `DELETE`, the only classification
  `audit_logs.operation_type` carries.

## Operations flows

### Tenant suspension and unsuspension

Suspension is a single-column write — `UPDATE tenants SET status = 'suspended'` — with three
consequences that are not obvious from the column.

**It is not instant.** `PLAN.md` §8.20 accepts, and does not fix, that a suspended tenant's users
keep working until their access tokens expire: access tokens are stateless JWTs validated by
signature, so suspension blocks new logins and refreshes immediately (auth returns `403
TENANT_SUSPENDED`, see the auth [error reference](../auth/api-reference.md#error-reference)) but
does nothing to a request already riding a token issued seconds earlier. The blast radius is the
remaining access-token lifetime — 15 minutes by default. This module surfaces that as explicit API
behaviour rather than hiding it; see [`POST
/v1/platform-admin/tenants/:tenantId/suspend`](./api-reference.md#post-v1platform-admintenantstenantidsuspend).

**It does not stop the background pipeline.** Nothing in the schema gates the 15-minute poller or
the auto-post path on `tenants.status`; the pipeline runs server-side with no access token at all,
so token expiry has no bearing on it. §8.20 is only about access tokens and says nothing about
this. Suspension is therefore only complete if the review pipeline also skips tenants whose
`status <> 'active'` — a requirement this document states because it is not derivable from the
schema and not currently specified anywhere else. Flagged in [Gap](#gap-between-current-code-and-target-design).

**Unsuspension cannot simply write `active`.** `tenant_status` has no "previous status" column and
the schema stores no suspension history, so a tenant suspended while still `pending_activation`
would be silently promoted to `active` by a naive unsuspend. `PLAN.md` §2 gives the rule that
resolves this without new schema: `pending_activation` "flips to `active` the moment the owner's
`users.status` becomes `active` — the tenant tracks whether it has a working owner, not the other
way around." So unsuspend derives the target status: `active` if the tenant has at least one
`users` row with `role = 'owner' AND status = 'active'`, otherwise `pending_activation`.

### Support access into a tenant

The mechanism is a short-lived, single-tenant, read-only **act-as token** minted by an explicit
endpoint — not a bypass flag on the platform-admin session. The reasoning is in [Tenant scoping
and attribution](#tenant-scoping-and-attribution); the sequence is worth a diagram because three
principals and two token kinds are in play at once.

```mermaid
sequenceDiagram
    participant PA as Platform Admin
    participant Ops as "Platform-admin API"
    participant Tenant as "Tenant-scoped API"
    participant DB as Database

    PA->>Ops: POST /tenants/{id}/support-access (reason, ttlMinutes)
    Ops->>DB: Verify tenant exists; verify admin status = 'active'
    Ops->>DB: INSERT support-access grant row (follow-up migration)
    Ops-->>PA: supportAccessToken (type=support_access, tenantId, scope=read_only, 15m, non-refreshable)

    PA->>Tenant: GET /v1/reviews (Authorization: Bearer supportAccessToken)
    Tenant->>Tenant: JwtStrategy sees type=support_access, so tenantId is trusted and role is absent
    Tenant->>Tenant: SupportAccessGuard: reject any non-GET, reject @Roles routes
    Tenant->>DB: SELECT ... WHERE tenant_id = $1 (one code path, unchanged)
    DB-->>Tenant: Rows for exactly that tenant
    Tenant-->>PA: Tenant data, read-only

    PA->>Ops: DELETE /support-access/{grantId}
    Ops->>DB: Set grant revoked_at (blocks nothing already issued — see below)
```

Two things the diagram deliberately shows as unresolved. The tenant-scoped repository query is
**unchanged** — it reads `tenant_id` off the payload exactly as it does for a tenant user, which is
the whole point of choosing a scoped token over a bypass. And revoking a grant has the same
latency problem as suspension for the same reason: the token is stateless, so revocation stops the
next mint, not the current token. A 15-minute non-refreshable TTL is what bounds it.

### Support-assisted tenant creation

`PLAN.md` §4.3d is the exception path behind `tenants.created_by_platform_admin_id`: a platform
admin provisions the tenant and invites its owner in one step, for assisted or sales-led
onboarding. §4.3d's own sequence diagram has the full flow; the short version is one transaction
writing `tenants` (`created_by_platform_admin_id = <caller>`, `status = 'pending_activation'`),
`users` (`role = 'owner'`, `status = 'invited'`, `invited_by_user_id = NULL`), `tenant_settings`
(defaults), and `password_reset_tokens` (`purpose = 'invite'`) — §8.10's atomicity concern applies
here identically.

The invited owner's `status` is `invited`, not `pending_verification`, because the platform admin
addressing the invite to a specific mailbox is the same assurance a member invite carries (§4.3d
states this explicitly). Everything after the invite email is **auth's**, unmodified: the owner
accepts via [`POST /v1/auth/invite/accept`](../auth/api-reference.md#post-v1authinviteaccept) or
[`GET /v1/auth/invite/:token/microsoft`](../auth/api-reference.md#get-v1authinvitetokenmicrosoft),
including the IdP-email-match requirement §4.3d inherits from §4.3b. This module does not
redocument any of that. Auth's api-reference already
[flags](../auth/api-reference.md#platform-admin-api) that §4.3d's *initiating* action has no
endpoint in that document and belongs "in whatever module owns platform-admin tenant management" —
that endpoint is [`POST /v1/platform-admin/tenants`](./api-reference.md#post-v1platform-admintenants),
and it closes that gap.

## Tenant scoping and attribution

Most tables in this schema carry a `tenant_id UUID NOT NULL`, so most queries are single-tenant
by construction. Nine do not, and the distinction matters here. Five are genuinely unscoped —
`tenants`, `platform_admins`, `platform_admin_identities`, `platform_admin_invites`, `audit_logs`.
The other four are tenant data that is scoped only **transitively, through a parent FK**:
`user_identities` and `password_reset_tokens` (via `users`), `user_locations` (via `locations` —
see [Connections](../connections/overview.md#data-model)), and `prompt_versions` (via `prompts` —
see [Prompts](../prompts/overview.md#data-model); `tone` itself is a column on `prompts`, so it
carries `tenant_id` directly and isn't in this list). On those four a `WHERE tenant_id = ?`
predicate is not available at all; scoping has to be a join, which is a materially weaker guard
than a local column and the place a cross-tenant read is most likely to slip through. A
cross-tenant principal is, by definition, the one
thing that invariant did not plan for — and the auth module has already documented the sharp edge:
the tenant-user JWT payload carries `tenantId`, the platform-admin payload has **none**, and auth's
security notes call trusting `tenantId` without first checking `type` "the highest-severity mistake
available in this module." This section builds directly on that.

**Specified approach: an explicitly-scoped act-as token. Not a bypass flag.** Two designs were
available.

- A **bypass flag** — put something like `isPlatformAdmin: true` in the platform-admin session
  token and teach every tenant-scoped repository to skip its `tenant_id` filter when it is set.
  Rejected. It makes correctness depend on a negative condition evaluated in dozens of places, and
  every single one of them is a full cross-tenant data leak when it is missed. It also inverts the
  invariant `PLAN.md` §2 bought by separating the hierarchies in the first place: queries stop
  being "safely assumable as single-tenant."
- An **act-as token** — a separate, short-lived credential that carries exactly one `tenant_id`,
  minted by an explicit endpoint against an explicit tenant. Chosen. Tenant-scoped code paths stay
  byte-for-byte identical: they read `tenantId` off the payload, filter on it, and never learn that
  the principal behind it was a platform admin. There is one place that can be wrong (the mint) and
  it is auditable, rather than N places that can be wrong silently.

**What the JWT must carry.** Three payload shapes, distinguished by `type`, which every guard and
repository must check before trusting any other claim:

```ts
// Tenant user — auth module, unchanged
{ sub: '<users.id>', tenantId: '<tenants.id>', email: string, role: 'owner' | 'member', type: 'tenant_user' }

// Platform admin session — auth module, unchanged. No tenantId, no role.
{ sub: '<platform_admins.id>', email: string, type: 'platform_admin' }

// Support access — net-new, minted by this module
{
  sub: '<platform_admins.id>',      // NOT a users.id — see the FK note below
  type: 'support_access',
  tenantId: '<tenants.id>',         // exactly one, fixed at mint time
  platformAdminId: '<platform_admins.id>',
  grantId: '<support-access grant id>',
  scope: 'read_only',
  exp: '<mint + 15 minutes>'        // non-refreshable
}
```

Four rules follow, and each needs to be a check rather than a comment:

1. **`type: 'platform_admin'` is accepted only on `/v1/platform-admin/**` routes.** A
   platform-admin session token presented to a tenant-scoped route has `tenantId: undefined`, and
   auth's security notes are explicit that `WHERE tenant_id = $1` with `$1 = undefined` does not
   reliably mean "match nothing" across query builders. Reject on `type`, before scoping.
2. **`type: 'support_access'` is accepted only on tenant-scoped routes, never on
   `/v1/platform-admin/**`.** Otherwise a read-only support token would be a fully-privileged
   platform-admin token that happens to carry a `tenantId` — including the ability to mint more
   tokens for other tenants.
3. **A support-access token carries no `role`.** `@Roles('owner')` routes must fail closed for it.
   Granting `role: 'owner'` would hand a support session the Settings surface: rotating the Google
   connection, editing the blocklist, inviting users.
4. **Read-only is enforced by an allow-list, not a denylist.** A `SupportAccessGuard` rejects any
   non-`GET` request and any route carrying `@Roles(...)`, so a tenant-scoped write route added
   later is closed by default rather than open until someone remembers it.

**Read-only is not a policy choice; the schema cannot express a platform-admin write.** This is
the concrete finding, and it is worth stating plainly because it constrains the design rather than
merely recommending it. Tenant tables attribute actions to `users.id` — `review_responses` has
`created_by_user_id` and `approved_by_user_id`, `review_provider_connections` has
`connected_by_user_id NOT NULL REFERENCES users(id) ON DELETE RESTRICT`. A support-access token's
`sub` is a `platform_admins.id`, which is not a valid `users.id`, so any attempt to write through
one either violates a foreign key or — far worse — gets "fixed" by attributing the write to some
real tenant user who did not make it. Searching the migrations for what a tenant-scoped row could
point at instead turns up exactly one column in the entire schema that references `platform_admins`
from outside its own three tables: `tenants.created_by_platform_admin_id`. There is **no
"acted by platform admin" concept on any tenant-scoped table anywhere**. Support access is
therefore read-only until a migration adds one.

**What `audit_logs` can and cannot attribute.** `log_db_changes()` (`0000_foundation.sql`) fires
`AFTER INSERT OR UPDATE OR DELETE` on every domain table and writes a full `to_jsonb` snapshot,
with no application code required. `PLAN.md` §6.1 is the design note behind it. Reading the actual
function and table:

- **It captures the change.** A suspension writes an `audit_logs` row with `table_name =
  'tenants'`, `operation_type = 'UPDATE'`, and `old_value`/`new_value` showing
  `status: 'active' → 'suspended'`. The *what* is covered, automatically, for every write this
  module makes.
- **It cannot say who.** The only actor columns are `db_user` (`session_user`), `db_name`, and
  `triggered_by` (`TG_NAME` for `AFTER` triggers, else `current_user`). All three are database-level
  values, identical for every request the application makes through its single connection pool.
  There is no `user_id`, `platform_admin_id`, or actor column of any kind on `audit_logs`. A
  suspension and an owner's settings change are indistinguishable in actor terms.
- **A suspension is not findable by tenant.** `log_db_changes()` derives `audit_logs.tenant_id`
  generically as `(new_row->>'tenant_id')::UUID`. The `tenants` table has an `id` column, not a
  `tenant_id` column, so every audit row for a `tenants` write lands with `tenant_id = NULL` — as
  do all `platform_admins`-family rows, which `0000_foundation.sql`'s comment notes is correct for
  genuinely unscoped rows. `0000_foundation.sql:87-89` states this deliberately — *"not a gap,
  those rows genuinely aren't scoped to one tenant"* — and `PLAN.md` §6.1 agrees, so this is a
  **query-side constraint, not a migration**: "show me everything that happened to this tenant"
  cannot be a single filter on `idx_audit_logs_tenant_id`; it must also match
  `table_name = 'tenants'` on `new_value->>'id'`, or the tenant's own suspension is silently
  omitted. Worth knowing before someone writes that query and trusts it.
- **It cannot log a read at all.** The trigger is a write trigger. Support access is a read
  activity, and `PLAN.md` §6.1 anticipates exactly this case, naming "logging a *read* rather than
  a write, e.g. 'a platform admin viewed this tenant's data'" as the one need that would justify
  reintroducing "a narrow, purpose-built table with a proper `user_id`." Support access is that
  need arriving.

**Follow-up migration required before support access ships**, stated the same way auth's
api-reference flags its missing `refresh_tokens` table — as a prerequisite, not an assumption:

```sql
-- Net-new. Nothing equivalent exists in 0000-0006 today.
CREATE TABLE platform_admin_support_grants (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    platform_admin_id UUID NOT NULL REFERENCES platform_admins(id) ON DELETE RESTRICT,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Plus, for the read trail §6.1 anticipates:
--   platform_admin_access_events (grant_id, route, method, tenant_id, occurred_at)
-- Plus, if a platform admin is ever to WRITE inside a tenant:
--   an acted_by_platform_admin_id column on each writable tenant table, or an actor column on
--   audit_logs populated from a per-transaction GUC (SET LOCAL app.actor_platform_admin_id)
--   that log_db_changes() reads via current_setting(..., true) — the function reads nothing of
--   the sort today, so this is a change to the trigger function, not only to a table.
```

Until the first of those exists, the support-access grant has nowhere durable to live, `grantId`
has nothing to reference, and revocation has nothing to write to.

## API surface

All routes are versioned under `/v1/platform-admin`. Authentication routes are the auth module's
and are **not** listed here — see [Auth Module — API
Reference](../auth/api-reference.md#platform-admin-api).

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/v1/platform-admin/tenants` | Bearer (`platform_admin`) | Paginated cross-tenant list; filter by `tenant_status`, search by name. |
| `GET` | `/v1/platform-admin/tenants/:tenantId` | Bearer (`platform_admin`) | One tenant: status, owner, user counts, connection and sync health. |
| `POST` | `/v1/platform-admin/tenants` | Bearer (`platform_admin`) | Support-assisted provisioning, `PLAN.md` §4.3d. Creates the owner invite; acceptance is auth's. |
| `POST` | `/v1/platform-admin/tenants/:tenantId/suspend` | Bearer (`platform_admin`) | Writes `tenants.status = 'suspended'`. Not instant — `PLAN.md` §8.20. |
| `POST` | `/v1/platform-admin/tenants/:tenantId/unsuspend` | Bearer (`platform_admin`) | Restores `active` or `pending_activation`, derived per `PLAN.md` §2. |
| `POST` | `/v1/platform-admin/tenants/:tenantId/support-access` | Bearer (`platform_admin`) | Mints a read-only, single-tenant, 15-minute act-as token. Needs the follow-up migration. |
| `GET` | `/v1/platform-admin/support-access` | Bearer (`platform_admin`) | Active and recent grants, for oversight. |
| `DELETE` | `/v1/platform-admin/support-access/:grantId` | Bearer (`platform_admin`) | Revokes a grant. Blocks the next mint, not the live token. |
| `GET` | `/v1/platform-admin/metrics/overview` | Bearer (`platform_admin`) | Cross-tenant aggregates only — counts, never rows. |
| `GET` | `/v1/platform-admin/admins` | Bearer (`platform_admin`) | Lists `platform_admins`. Email and status only; there is no `name` column. |
| `POST` | `/v1/platform-admin/admins/:adminId/disable` | Bearer (`platform_admin`) | `status = 'disabled'`. Never a row delete. |
| `POST` | `/v1/platform-admin/admins/:adminId/enable` | Bearer (`platform_admin`) | `status = 'active'`. Cannot resurrect an `invited` admin — that is auth's invite flow. |

Inviting a platform admin is deliberately absent: it is [`POST
/v1/platform-admin/auth/invite`](../auth/api-reference.md#platform-admin-api), owned by auth.

Full request/response contracts, field tables, and error codes: [Platform Admin Module — API
Reference](./api-reference.md).

## MVP scope

Being honest about this matters more here than in most modules, because the module's *design*
surface is considerably wider than its MVP *need*. This engagement is one tenant with effectively
one user; a cross-tenant admin console has almost nothing to be cross-tenant about yet.

**There is no platform-admin frontend in `apps/web` at all today.** Verified: `apps/web/src`
contains zero references to `platform-admin`, `platformAdmin`, or `platform_admin`, and the App
Router tree is `(auth)`, `(public)`, and `(dashboard)/{dashboard,review-queue,settings}` — a
tenant-user app end to end, with no admin route group. Whatever ships for MVP is consumed through
Swagger (`localhost:3000/api/v1`) or `curl` by GeekyAnts staff, not through a UI. That is a
reasonable place to stop for an internal tool with a handful of operators; it is not a gap to
apologise for, but it does mean no endpoint here should be justified by "the admin UI needs it."

Mirroring how auth's [Frontend / backend
boundary](../auth/overview.md#frontend--backend-boundary) separates what the backend supports from
what the frontend exposes:

| Surface | MVP | Reasoning |
|---|---|---|
| `GET /tenants`, `GET /tenants/:tenantId` | **Needed** | The minimum that makes a support ticket answerable without a psql session. |
| `POST /tenants/:tenantId/suspend` / `unsuspend` | **Needed** | The only kill switch the platform has, and the only writer of `tenants.status = 'suspended'` anywhere. |
| `GET /admins`, `POST /admins/:adminId/disable` | **Needed, minimally** | Offboarding an admin has to be possible without a manual `UPDATE`. `enable` is a convenience. |
| `POST /tenants` (provisioning, §4.3d) | **Designed, deferred** | §2 says outright not to design the primary flow around it; §4.3d calls it "the rare case." Self-service signup covers this engagement. Specified now so the invite semantics are settled before someone improvises them under sales pressure. |
| `POST /tenants/:tenantId/support-access` and the grant endpoints | **Designed, deferred — and blocked** | Cannot ship before the follow-up migration in [Tenant scoping and attribution](#tenant-scoping-and-attribution). With one tenant and one user, the support scenario it serves barely exists. It is documented in full anyway because it is the one part of this module that can go badly wrong quietly, and "we'll work out the token shape when we build it" is how a bypass flag gets added instead. |
| `GET /metrics/overview` | **Deferred** | Genuinely uninteresting at one tenant. Also the most expensive endpoint here — see [Gap](#gap-between-current-code-and-target-design). |

Nothing above is gated on MVP scope at the API level. As with auth, the backend documents its full
target surface and lets deployment decide what to expose; a deferred endpoint is one that has not
been built yet, not one that has been designed away.

## Gap between current code and target design

**Nothing of this module exists in `apps/backend/src/` today.** Verified: `src/api/` contains only
`dev-tools`, `health`, `metrics`, and `tracing`; the only files anywhere under `src/` that mention
`platform_admin` are the three migrations and the migration journal. Unlike the auth module — which
exists as generic boilerplate modeling a different product — this module is a clean greenfield
build. That is the easier starting point, and it means every item below is "add," not "replace."

To be built:

- **The module itself**, at `src/api/platform-admin/`. It has four operations controllers
  (tenants, support access, metrics, admins), so `apps/backend/docs/conventions/module-structure.md`'s
  multi-controller layout applies: `controllers/` and `services/` subfolders rather than flat
  files at the module root, with `swagger/<controller-name>.swagger.ts` per controller (same base
  name), plus the required `constants/`, `types/`, and `dto/` subfolders. The platform-admin
  *authentication* controller is a fifth surface and belongs in this same module's `controllers/`
  folder — `src/api/platform-admin/` owns both the login story and the operations story for this
  principal, while `src/api/auth/` stays purely tenant-user. Its endpoint *contracts* are still
  documented in [auth's api-reference](../auth/api-reference.md#platform-admin-api) rather than
  here, since they mirror the tenant-user flows one-for-one; only the code placement lives with
  this module.
- **`PlatformAdminDbService` + `PlatformAdminRepository`**, both under
  `src/db/repositories/platform-admin/` per the four-layer convention — Controller → Service → DB
  Service → Repository, with the Service never importing the Repository and never running a
  Drizzle query. The DB Service owns §4.3d's four-table provisioning transaction (`tenants` +
  `users` + `tenant_settings` + `password_reset_tokens`), which is exactly the multi-repository
  transaction that layer exists for.
- **Route names.** `src/common/route-names.ts` has **no** `PLATFORM_ADMIN*` entries of any kind
  today — including `RouteNames.PLATFORM_ADMIN_AUTH`, which auth's api-reference already cites as
  though it exists. All of them are net-new: `PLATFORM_ADMIN_AUTH = 'platform-admin/auth'` (auth's,
  flagged here for completeness), plus `PLATFORM_ADMIN_TENANTS`,
  `PLATFORM_ADMIN_SUPPORT_ACCESS`, `PLATFORM_ADMIN_METRICS`, and `PLATFORM_ADMIN_ADMINS`. The
  existing `QUEUES_UI = 'admin/queues'` is the precedent for a slash-containing enum value, so no
  new pattern is needed.
- **`src/common/constants/messages.constants.ts`** — the file does not exist (`src/common/constants/`
  is not a directory at all). Every user-facing string this module produces goes through it, not
  an inline literal. Same prerequisite auth flags.
- **A `PlatformAdminGuard`** that rejects any token whose `type` is not `platform_admin`, and a
  **`SupportAccessGuard`** that enforces the allow-list in [Tenant scoping and
  attribution](#tenant-scoping-and-attribution). `RolesGuard`/`PermissionsGuard` are no help here:
  `platform_admins` has no `role` column, and per auth's overview those guards still read a
  `roles: string[]` / `permissions: string[]` shape no table in this schema has.
- **DTOs with an `example` on every `@ApiProperty`**, and an explicit return type on every method
  at every layer — both non-negotiable per `apps/backend/CLAUDE.md`.

Schema gaps. The first is a hard blocker — three endpoints have no storage without it; the rest
are constraints to design around rather than migrations that gate shipping:

- **No support-access grant table.** See the `platform_admin_support_grants` sketch above. Without
  it, `POST /tenants/:tenantId/support-access` has nowhere to record a grant, `GET /support-access`
  has nothing to list, and `DELETE /support-access/:grantId` has nothing to revoke.
- **No read-audit table.** `log_db_changes()` is a write trigger; `PLAN.md` §6.1 names
  platform-admin reads as the case that would justify a purpose-built table with a real `user_id`.
- **No actor attribution on writes.** `audit_logs` has no actor column and `log_db_changes()`
  captures none. Suspension is audited as a change with no author. Closing this means either an
  actor column populated from a per-transaction GUC (a change to the trigger *function*, not just a
  table) or `acted_by_platform_admin_id` columns on writable tenant tables.
- **`audit_logs.tenant_id` is NULL for every `tenants` write**, because the function reads
  `new_row->>'tenant_id'` and `tenants` has no such column. A per-tenant audit query using
  `idx_audit_logs_tenant_id` will not find the tenant's own suspension. Either the function
  special-cases `tenants` (falling back to `->>'id'` for that table) or the query does.
- **No `refresh_tokens` table** — auth's prerequisite, inherited. The support-access token is
  deliberately non-refreshable partly so this module adds no new dependency on it.

Cross-module requirements this module creates:

- **The review pipeline must skip tenants whose `status <> 'active'`.** Suspension is otherwise
  incomplete: it stops people, not polling or auto-posting. Not covered by §8.20, which is only
  about access tokens.
- **Platform-wide aggregates have no supporting index.** `reviews` is indexed on `tenant_id`,
  `location_id`, `status`, `classification`, and `reviewed_at`, but a cross-tenant count spans every
  partition of the table by design. Fine at one tenant, a full scan later — `GET /metrics/overview`
  should be materialized or cached before it means anything, which is a further reason it sits last
  in [MVP scope](#mvp-scope).
