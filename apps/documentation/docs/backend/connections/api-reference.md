---
sidebar_position: 2
---

# Connections Module — API Reference

## How to read this document

This is the **target/spec design** for the connections module's HTTP surface. None of it is
implemented: as the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design) records, there is no
`src/api/connections/`, no `src/db/repositories/connections/`, and no `CONNECTIONS` entry in
`src/common/route-names.ts` in `apps/backend/src/` today — the only file that mentions this
module's tables is the migration that creates them. Everything below is the contract to build
against, not a description of running code.

It assumes you have read [Connections Module — Overview](./overview.md) for the data model, the
`review_provider` vs. `user_identity_provider` distinction, and the four connection flows. This
document does not repeat those; it turns them into request/response contracts. It is
intentionally **HTTP-contract-level only** — no controller code, no decorator snippets. When
implementing a route below it lives under `src/api/connections/` per
`apps/backend/docs/conventions/module-structure.md`: the JSON shown here is what that route's
Swagger decorator (in that controller's `swagger/` file) should render as its example, and every
success or error `message` string comes from `src/common/constants/messages.constants.ts` — which
does not exist yet and must be created — never an inline literal.

Every route here is part of the **backend's** target surface regardless of what the shipped UI
calls today. The onboarding flow only ever confirms a single discovered location and the Settings
tab renders no sync history at all; that is a frontend scope decision (see the overview's
[MVP scope](./overview.md#mvp-scope)), not a reason to drop or gate a route documented below.

## Conventions

- **Base path**: `/v1/connections/...` — `RouteNames.CONNECTIONS` (to be added), `version: '1'`
  on the controller.
- **Auth column**: `Public` — no bearer token (`@Public()`, skips `JwtAuthGuard`); used only by
  the OAuth callback, which is entered by Google, not by the SPA. `Bearer` — needs
  `Authorization: Bearer <access_token>` or the equivalent `sid` cookie, and the request's
  `tenantId` claim scopes every query. Routes marked `@Roles('owner')` additionally reject a
  `member`.
- **Token type must be checked before `tenant_id` is trusted.** Every route here requires
  `type === 'tenant_user'` (or a `support_access` token, which is read-only — see
  [Platform Admin](../platform-admin/api-reference.md#conventions)). This is not belt-and-braces:
  a `platform_admin` token carries **no** `tenantId` claim at all, so an unchecked route builds
  `WHERE tenant_id = undefined`, and in the usual Drizzle idiom
  `and(...[tenantId && eq(t.tenantId, tenantId), ...])` a falsy term is *dropped* rather than
  matching nothing — the tenant filter silently disappears and the endpoint returns every
  tenant's rows. Auth's security notes call this "the highest-severity mistake available in this
  module"; see [session/token model](../auth/api-reference.md#session--token-model-1).
- **Envelopes**: identical to auth's. Success `data` payloads shown below are the *inner*
  payload, wrapped by `TransformInterceptor`; errors come uniformly from `HttpExceptionFilter` +
  `ErrorHandlerService` with a `traceId`. Both shapes are defined by
  `src/common/dto/api-response.ts`. Rather than restate them, see
  [auth's Conventions](../auth/api-reference.md#conventions) for the full version.
- **Throttling**: the global `short` tier (30/min) unless a route overrides it. Exactly one route
  does — see [`GET .../backfill`](#get-v1connectionslocationslocationidbackfill).

## Connection lifecycle

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/connections` | Bearer | 30 / min |
| `GET` | `/v1/connections/google/authorize` | Bearer, `@Roles('owner')` | 30 / min |
| `GET` | `/v1/connections/google/callback` | Public | 30 / min |
| `DELETE` | `/v1/connections/google` | Bearer, `@Roles('owner')` | 10 / min |

### `GET /v1/connections`

The tenant's whole connection picture in one call: the `review_provider_connections` row, the
location it resolved to, and that location's rolled-up sync health. This is what Settings →
Connection renders and what the dashboard's access guard checks before letting a user past
onboarding, so it must answer "is this tenant set up?" without the caller making three requests
and stitching them together.

It returns both a coarse `status` and the underlying `connectionStatus` deliberately. The
frontend's `ConnectionStatus` union is `connected` | `disconnected`, but
`google_connection_status` is `active` | `needs_reauth` — a broken-but-present connection has no
faithful representation in the two-value union, and collapsing `needs_reauth` into `connected`
would hide precisely the failure `PLAN.md` §8.14 added that enum value to surface. `status` keeps
today's UI working unchanged; `connectionStatus` lets it grow a third "action needed" state with
no API change.

A tenant with no connection at all is **not** a `404` — "not connected yet" is the normal state
of every tenant between signup and onboarding, and a guard that has to treat `404` as success is
a guard that will eventually treat a real `404` as success too.

| Field | Type | Rules |
|---|---|---|
| `connected` | boolean | `true` when an active connection **and** an `active` location both exist. |
| `status` | string | `connected` \| `disconnected` — the coarse value today's UI consumes. |
| `connection` | object \| null | `null` when the tenant has never connected, or after a disconnect. |
| `connection.id` | string (uuid) | `review_provider_connections.id`. |
| `connection.provider` | string | `review_provider` — `google`. |
| `connection.providerAccountId` | string | `provider_account_id` as returned by the provider. |
| `connection.connectionStatus` | string | `google_connection_status` — `active` \| `needs_reauth`. |
| `connection.tokenExpiresAt` | string (ISO) \| null | `token_expires_at`; nullable in the schema. |
| `connection.connectedByUserId` | string (uuid) | `connected_by_user_id`. |
| `connection.connectedAt` | string (ISO) | `created_at`. |
| `location` | object \| null | The tenant's `active` location; `null` before one is confirmed. |
| `location.businessName` | string | Alias of `locations.name`, matching the frontend's `ConnectionInfo.businessName`. |
| `location.lastSyncedAt` | string (ISO) \| null | `last_synced_at`. |
| `location.lastSyncStatus` | string \| null | `sync_health_status` — `ok` \| `error`. Never `running`; see the overview. |
| `location.lastSyncError` | string \| null | `last_sync_error`. |
| `location.onboardingBackfillCompletedAt` | string (ISO) \| null | `NULL` means live polling is still gated (`PLAN.md` §8.2). |

Success `200`:

```json
{
  "connected": true,
  "status": "connected",
  "connection": {
    "id": "0190f4c1-8a21-7c33-9f01-2b7d5e8a4410",
    "provider": "google",
    "providerAccountId": "accounts/106574839201847362518",
    "connectionStatus": "active",
    "tokenExpiresAt": "2026-09-04T10:12:00.000Z",
    "connectedByUserId": "0190f3b2-4c17-7a88-b210-9e4f1c7d3a02",
    "connectedAt": "2026-09-01T09:04:11.000Z"
  },
  "location": {
    "id": "0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4",
    "provider": "google",
    "externalLocationId": "locations/12345678901234567890",
    "businessName": "The Coastal Table",
    "address": "214 Harbor St, Portland, ME",
    "status": "active",
    "lastSyncedAt": "2026-09-01T14:15:00.000Z",
    "lastSyncStatus": "ok",
    "lastSyncError": null,
    "onboardingBackfillCompletedAt": "2026-09-01T09:11:42.000Z"
  }
}
```

Errors: `401` (missing/expired token), `403 TENANT_SUSPENDED`, `429`.

### `GET /v1/connections/google/authorize`

Starts the GBP OAuth grant and `302`s to Google's consent screen. This is a **review-data**
authorization, not a login — nothing here touches `user_identities`, and the caller is already
authenticated when they hit it. Because it is entered as a top-level browser navigation, the
tenant context cannot ride in a request body: `tenantId` and the acting `userId` (which becomes
`review_provider_connections.connected_by_user_id`) are read off the bearer/cookie session and
signed into the OAuth `state` parameter, along with an `intent` of `connect` and a nonce. As in
auth, `state` must be HMAC-signed and TTL-bounded and must never be trusted unverified on the way
back — an unsigned `state` here would let an attacker graft their own Google account onto someone
else's tenant.

**Signing alone is not enough, and this is the sharp edge of this route.** A self-contained signed
blob is a bearer credential meaning "write a connection into tenant X", and the attacker holds a
validly-signed one for their *own* tenant. So the nonce must be **persisted server-side against
the initiating session and consumed exactly once on callback**; a callback whose nonce is unknown
or already used is rejected outright. Without that, the attack runs in the opposite direction to
the one above: an attacker starts a connect flow on their own tenant, sends the resulting Google
consent URL to a victim business owner, and the victim's consent writes *their* Google Business
Profile onto the **attacker's** tenant — after which the §7 backfill imports the victim's entire
review history and the attacker can post public replies as the victim's business. A state
signature proves the server minted the blob; it proves nothing about who is completing the flow.

**This is also the reconnect route.** `PLAN.md` §8.8 states reconnecting after `needs_reauth`
must be an upsert against `(tenant_id, provider, provider_account_id)` rather than a blind insert
that fails the unique index, and since the round trip is byte-identical there is no separate
`/reauth` endpoint to keep in sync. The optional `returnTo` param is what lets the same route
serve both entry points: onboarding sends the owner back to the connect wizard, Settings sends
them back to Settings.

Configuration this route needs, none of which exists in `src/config/env.config.ts` yet:
`GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_CALLBACK_URL` (must exactly match the redirect URI
registered on the Google Cloud project), and `FRONTEND_URL`. Do **not** reuse auth's existing
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_CALLBACK_URL` — those back Google *login*, need
different scopes, and sharing one client means revoking review access also breaks sign-in.

| Query param | Type | Rules |
|---|---|---|
| `returnTo` | string | Optional. One of a small server-side allowlist of frontend paths (`onboarding` \| `settings`), never a raw URL — accepting an arbitrary URL here makes this an open redirect. Defaults to `onboarding`. |

Success `302`: `Location` is Google's consent URL with the signed `state` attached. No JSON body.

Errors: `401`, `403` (caller is a `member`, not an `owner`), `400` validation (unknown
`returnTo`), `429`.

### `GET /v1/connections/google/callback`

The single GBP callback. `@Public()`, because Google — not the SPA — performs this request, and
it carries no bearer token; all tenant context comes from `state`, whose signature and TTL are
verified **first, unconditionally**, before `code` is exchanged or anything is written. An
invalid or expired `state` is a `302` to the frontend with `?error=INVALID_STATE`, never a JSON
error, since the user is sitting in a browser navigation.

On a verified `state`, the route exchanges `code` for tokens, reads the provider account id, and
**upserts** `review_provider_connections` on `(tenant_id, provider, provider_account_id)` —
`ON CONFLICT` updating `credential_reference`, `token_expires_at`, and
`status = 'active'`. `credential_reference` is a `VARCHAR(255)` **pointer** to the credential in
the secret store (`src/config/secrets-bootstrap.ts`'s AWS Secrets Manager path), not the token
itself; the raw refresh token must never land in a Postgres column. First-time connect and
recovery from `needs_reauth` are the same write, which is exactly what `PLAN.md` §8.8 asks for.

One case the upsert key does not cover: an owner with a `needs_reauth` connection who completes
consent as a *different* Google account. `(tenant_id, provider, provider_account_id)` won't match,
so a naive upsert inserts a **second** connection row — one holding the tenant's existing
location, one holding nothing — and MVP's one-connection rule is silently broken with no error
anywhere. The callback must therefore compare the returned `provider_account_id` against any
existing connection for the tenant and, on a mismatch, redirect with `?error=ACCOUNT_MISMATCH`
without writing. Note this constraint is genuinely per-tenant, unlike auth's `user_identities`,
which is unique on `(provider, provider_user_id)` *globally* (`PLAN.md` §8.21): the same Google
account legitimately backing GBP connections in two different tenants is a supported case (an
agency), so there is no global uniqueness check to make here.

| Query param | Type | Rules |
|---|---|---|
| `code` | string | Provided by Google. Absent when the owner declines consent — treat as `ACCESS_DENIED`. |
| `state` | string | Signed payload carrying `tenantId`, `userId`, `intent: 'connect'`, `returnTo`, nonce. Signature + TTL verified before anything else. |
| `error` | string | Provided by Google instead of `code` when consent fails. Mapped to `PROVIDER_ERROR`. |

Success `302`: to `${FRONTEND_URL}/onboarding/connect?connected=1` (or
`/settings?tab=connection&connected=1` when `state.returnTo` is `settings`). The frontend then
calls [`GET /v1/connections/google/available-locations`](#get-v1connectionsgoogleavailable-locations)
to enter the confirm-location stage. No tokens are ever appended to this redirect — unlike auth's
callback, this route issues no app session; the user already had one.

Errors: all as `302` with `?error=` — `INVALID_STATE`, `ACCESS_DENIED`, `PROVIDER_ERROR`,
`ACCOUNT_MISMATCH`. See [Error reference](#error-reference).

### `DELETE /v1/connections/google`

Disconnect. The destructive-looking action that must not destroy anything: per `PLAN.md` §8.15
this **never** issues a `DELETE` on `locations`. It flips every one of the tenant's locations to
`status = 'inactive'` and revokes the stored credential with the provider. The poller stops
selecting inactive locations on its next tick, and historical `reviews` / `sync_runs` /
`review_responses` rows stay exactly where they are.

The reason is a cascade chain worth spelling out because the schema makes the wrong thing easy:
`locations.provider_connection_id` is `ON DELETE CASCADE`, and both `reviews.location_id` and
`sync_runs.location_id` cascade from `locations`. Deleting a connection row would therefore take
the tenant's entire review history with it *and* free §8.1's `UNIQUE (location_id) WHERE status =
'running'` lock out from under a poller still mid-batch, which then hits FK violations on its next
upsert. A genuine `DELETE` on a `locations` row is a support/admin operation that must first
refuse (or wait out) any `sync_runs` row still `running` for that location; it is not this
endpoint.

This endpoint has a **known schema gap**, called out rather than papered over:
`google_connection_status` is (`active`, `needs_reauth`) with no `disconnected` value, so there is
nowhere on the connection row to record that the owner disconnected. Required follow-up
migration: a nullable `review_provider_connections.disconnected_at TIMESTAMPTZ` (preferred — it
records *when*, survives a later reconnect as history, and keeps `status` describing credential
health rather than owner intent), or `ALTER TYPE google_connection_status ADD VALUE
'disconnected'`. **Until one of those lands**, disconnected-ness is derived from
"every location for this connection is `inactive`", which is why
[`GET /v1/connections`](#get-v1connections) computes `connected` from the location's status and
not from `connectionStatus` alone. Reconnecting is the ordinary
[`authorize`](#get-v1connectionsgoogleauthorize) route again; it reactivates the matched location
rather than creating a second one.

There is no request body — the tenant's connection is identified by the bearer token's `tenantId`
and the single `review_provider` value.

Success `200`:

```json
{
  "provider": "google",
  "deactivatedLocationIds": ["0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4"],
  "credentialRevoked": true,
  "pollingStopped": true
}
```

| Field | Type | Rules |
|---|---|---|
| `deactivatedLocationIds` | string[] | Every location flipped to `location_status = 'inactive'` by this call. Empty when they were already inactive — the call is idempotent. |
| `credentialRevoked` | boolean | `false` when the provider's revoke call failed; the local deactivation still succeeded, and this is logged rather than surfaced as an error, because leaving the tenant unable to disconnect is worse than an unrevoked upstream grant. |
| `pollingStopped` | boolean | Always `true` on success — restates the §8.15 guarantee for the caller, which cannot otherwise tell deactivation from deletion. |

Errors: `401`, `403` (a `member` tried to disconnect), `404 CONNECTION_NOT_FOUND`, `429`.

## Locations

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/connections/google/available-locations` | Bearer, `@Roles('owner')` | 30 / min |
| `GET` | `/v1/connections/locations` | Bearer | 30 / min |
| `POST` | `/v1/connections/locations` | Bearer, `@Roles('owner')` | 10 / min |

### `GET /v1/connections/google/available-locations`

Lists the locations the granted provider account can actually see. This is a **live provider
call**, not a database read: nothing is persisted until the owner confirms one, so calling this
twice is free and calling it after a reconnect correctly reflects locations added or removed on
Google's side in the meantime. It backs the onboarding `confirm_location` stage, which today
renders exactly one result and a Continue button — the API returns a list regardless, so a
multi-location picker is a frontend change with no backend work.

Because it needs a working credential, this is the first place a stale grant shows up
interactively rather than inside a background poll. A `401`/`403` from the provider here gets the
same treatment `PLAN.md` §8.14 specifies for the poller: set
`review_provider_connections.status = 'needs_reauth'` before returning, so the failure is
recorded rather than only reported, and answer `409 CONNECTION_NEEDS_REAUTH` so the frontend can
send the owner back through consent.

| Field | Type | Rules |
|---|---|---|
| `locations[].externalLocationId` | string | The provider's own identifier — the value to pass to [`POST /v1/connections/locations`](#post-v1connectionslocations). Maps to `locations.external_location_id` (`VARCHAR(255)`). |
| `locations[].name` | string | Maps to `locations.name` (`VARCHAR(255)`, `NOT NULL`). |
| `locations[].address` | string \| null | Maps to `locations.address` (`TEXT`, nullable) — a service-area business may have none. |
| `locations[].alreadyConnected` | boolean | `true` when a `locations` row already exists for `(provider_connection_id, external_location_id)`. Lets the UI show "already set up" instead of offering a confirm that would `409`. |

Success `200`:

```json
{
  "provider": "google",
  "connectionId": "0190f4c1-8a21-7c33-9f01-2b7d5e8a4410",
  "locations": [
    {
      "externalLocationId": "locations/12345678901234567890",
      "name": "The Coastal Table",
      "address": "214 Harbor St, Portland, ME",
      "alreadyConnected": false
    }
  ]
}
```

Errors: `401`, `403`, `404 CONNECTION_NOT_FOUND` (no connection for this tenant),
`409 CONNECTION_NEEDS_REAUTH`, `502 PROVIDER_UNAVAILABLE`, `429`.

### `GET /v1/connections/locations`

The tenant's **persisted** `locations` rows — the database counterpart to the live discovery call
above, and the read every other module uses to answer "which location am I working with." Returns
inactive locations too, so a disconnected tenant's history is still addressable; filter on
`status` when only pollable locations matter.

Available to any authenticated tenant user, not just an owner: a `member` works the review queue
and needs to know which location the queue belongs to. The MVP result is a one-element array, and
the query joins through `user_locations` rather than filtering on `locations.tenant_id` alone —
identical results today (see the overview's [MVP scope](./overview.md#mvp-scope)), and already
correct on the day a tenant has two locations and a member is scoped to one.

| Query param | Type | Rules |
|---|---|---|
| `status` | string | Optional. `location_status` — `active` \| `inactive`. Omitted returns both. |

Success `200`:

```json
{
  "locations": [
    {
      "id": "0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4",
      "connectionId": "0190f4c1-8a21-7c33-9f01-2b7d5e8a4410",
      "provider": "google",
      "externalLocationId": "locations/12345678901234567890",
      "name": "The Coastal Table",
      "address": "214 Harbor St, Portland, ME",
      "status": "active",
      "lastSyncedAt": "2026-09-01T14:15:00.000Z",
      "lastSyncStatus": "ok",
      "lastSyncError": null,
      "onboardingBackfillCompletedAt": "2026-09-01T09:11:42.000Z",
      "createdAt": "2026-09-01T09:05:02.000Z"
    }
  ]
}
```

Errors: `401`, `400` validation (unknown `status` value), `429`.

### `POST /v1/connections/locations`

Confirms which discovered location this tenant is actually managing, and is the single most
consequential write in the module. It is one transaction spanning three tables — which is exactly
the composition `apps/backend/docs/conventions/module-structure.md` puts in the DB service rather
than the business service:

1. **Upsert `locations`** on `(provider_connection_id, external_location_id)` — the unique index
   `PLAN.md` §2 calls "required for idempotent upsert" — with `status = 'active'` and `provider`
   copied off the connection row (it is denormalized and no constraint keeps it honest, so it must
   never be taken from the request body).
2. **Insert `user_locations`** for the confirming user, unique on `(user_id, location_id)`.
3. **Insert the backfill `sync_runs` row** — `"trigger" = 'backfill'`, `status = 'running'`,
   `started_at = now()` — and enqueue the pipeline's historical-import job. `PLAN.md` §7 puts the
   backfill exactly here: "right after the Google connection + location are set up during
   onboarding, and before regular polling/classification/generation goes live." No separate
   consent step is needed; §7 is explicit that this reads data already covered by the scope granted
   during the OAuth connection.

Step 3 is also where a race is handled for free. `sync_runs` carries
`UNIQUE (location_id) WHERE status = 'running'` (`PLAN.md` §8.1), so a double-submitted confirm —
two tabs, an impatient double-click — has its second insert rejected by the database rather than
starting a second concurrent import over the same review history. Surface that as
`409 BACKFILL_ALREADY_RUNNING` and let the frontend fall straight through to the polling stage,
which is what the owner wanted anyway. Note the paired staleness rule from the same section: a
`running` row older than 30 minutes is treated as not blocking, so a crashed backfill cannot
permanently wedge a location — and because §8.2 gates the *entire* live pipeline on this backfill
finishing, a permanent wedge here would mean a tenant that never ingests a single review.

`onboardingBackfillCompletedAt` is deliberately **not** set by this endpoint. The pipeline sets it
when the import finishes, and that column is what un-gates live polling (`PLAN.md` §8.2) — this
route only opens the run.

Request:

```json
{
  "externalLocationId": "locations/12345678901234567890"
}
```

| Field | Type | Rules |
|---|---|---|
| `externalLocationId` | string | Required, 1–255 chars. Must appear in the tenant's current [`available-locations`](#get-v1connectionsgoogleavailable-locations) result — re-validated server-side against the provider, never trusted from the client, since an arbitrary value would otherwise create a `locations` row that no poll can ever resolve. |

Success `201`:

```json
{
  "id": "0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4",
  "connectionId": "0190f4c1-8a21-7c33-9f01-2b7d5e8a4410",
  "provider": "google",
  "externalLocationId": "locations/12345678901234567890",
  "name": "The Coastal Table",
  "address": "214 Harbor St, Portland, ME",
  "status": "active",
  "onboardingBackfillCompletedAt": null,
  "backfill": {
    "syncRunId": "0190f4c3-9e07-7d15-a4c8-3f1b6d2e9057",
    "status": "running",
    "trigger": "backfill",
    "startedAt": "2026-09-01T09:05:03.000Z"
  }
}
```

Errors: `400` validation, `401`, `403` (a `member` cannot confirm a location),
`404 CONNECTION_NOT_FOUND`, `404 EXTERNAL_LOCATION_NOT_FOUND` (the id isn't visible to this
connection), `409 CONNECTION_NEEDS_REAUTH`, `409 LOCATION_LIMIT_REACHED` (MVP's one-active-location
rule — an application rule, not a database constraint, see the overview's
[MVP scope](./overview.md#mvp-scope)), `409 BACKFILL_ALREADY_RUNNING`, `429`.

## Onboarding backfill

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/connections/locations/:locationId/backfill` | Bearer | 120 / min |

### `GET /v1/connections/locations/:locationId/backfill`

Progress for the one-time historical import, polled by the onboarding `backfilling` stage until
it reports done. It reads the location's most recent `sync_runs` row with
`"trigger" = 'backfill'` plus `locations.onboarding_backfill_completed_at`, and exists because
the UI stage it backs is a progress bar, not a spinner — the frontend's
`use-onboarding-connect-flow.ts` currently fakes that bar with a `setInterval`, and this is the
call that replaces the fake.

**Terminal is `onboardingBackfillCompletedAt`, not `status`.** These are two different facts and
the frontend must gate the `done` stage on the former. `sync_runs.status = 'ok'` means the import
job finished; `locations.onboarding_backfill_completed_at` being set is what un-gates the live
poller and classifier (`PLAN.md` §8.2). Advancing the UI on `status` alone would show the owner a
"you're all set" screen for a location the scheduler is still refusing to enqueue. `livePollingEnabled`
is returned as the single boolean to branch on so no caller has to know that reasoning.

**The progress bar's denominator is a schema gap, and this response is honest about it.**
`sync_runs` has `reviews_fetched INTEGER` and nothing to divide it by — no total, no target.
`totalToImport` and `progress` are therefore `null` until a nullable `sync_runs.reviews_total`
column is added (see the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design)), and the UI must fall back to an
indeterminate bar rather than inventing a percentage. `reviewsFetched` is always real and always
increasing, so "112 reviews imported" is available even when "112 of 187" is not.

This is the one route with a **throttle override**. At the global `short` tier a 2-second poll
exceeds 30 requests inside the first minute and the owner's progress bar dies with a `429`
mid-onboarding. `120 / min` with a recommended 2–3 second client interval leaves headroom for a
retry or a second tab; the existing named tiers cannot express it (`medium` is 100 per *five*
minutes, which is stricter, not looser), so it needs an explicit per-route
`@Throttle` limit.

| Field | Type | Rules |
|---|---|---|
| `status` | string \| null | `sync_run_status` — `running` \| `ok` \| `error`. `null` when no backfill run exists for this location yet. |
| `trigger` | string | `sync_trigger` — always `backfill` here. |
| `reviewsFetched` | integer \| null | `sync_runs.reviews_fetched`; nullable in the schema and typically `null` until the run completes. |
| `totalToImport` | integer \| null | Always `null` today — no column backs it, see above. |
| `progress` | integer \| null | 0–100. `null` whenever `totalToImport` is `null`; never synthesized. |
| `errorMessage` | string \| null | `sync_runs.error_message`, populated when `status = 'error'`. Safe to show the owner alongside a retry affordance. |
| `isStale` | boolean | `true` when `status = 'running'` and `started_at` is older than 30 minutes — `PLAN.md` §8.1's staleness tolerance, surfaced so the UI can stop polling forever behind a crashed job. |
| `livePollingEnabled` | boolean | `onboarding_backfill_completed_at IS NOT NULL`. The only correct signal for "advance to the done stage." |

Success `200`:

```json
{
  "locationId": "0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4",
  "syncRunId": "0190f4c3-9e07-7d15-a4c8-3f1b6d2e9057",
  "status": "running",
  "trigger": "backfill",
  "startedAt": "2026-09-01T09:05:03.000Z",
  "completedAt": null,
  "reviewsFetched": 112,
  "totalToImport": null,
  "progress": null,
  "errorMessage": null,
  "isStale": false,
  "onboardingBackfillCompletedAt": null,
  "livePollingEnabled": false
}
```

Errors: `401`, `404 LOCATION_NOT_FOUND` (including a location belonging to another tenant — the
tenant-scoped lookup must return `404`, never `403`, so the response cannot be used to probe
whether an id exists elsewhere), `429`.

## Sync health

| Method | Path | Auth | Throttle |
|---|---|---|---|
| `GET` | `/v1/connections/locations/:locationId/sync-health` | Bearer | 30 / min |
| `GET` | `/v1/connections/locations/:locationId/sync-runs` | Bearer | 30 / min |

### `GET /v1/connections/locations/:locationId/sync-health`

The current answer to "is ingestion working for this location," assembled from the three places
that each hold part of it: `locations.last_sync_*` (the rolled-up snapshot of the most recent
attempt), `review_provider_connections.status` (whether the credential still works), and any
`sync_runs` row currently `running`. `PLAN.md` §2's `locations` note is the reason this needs more
than one field: `status` and `last_sync_status` answer different questions, and a
`status = 'inactive'` location's sync health should be ignored rather than reported as broken —
`healthy` encodes that combination so no caller re-derives it.

`isStale` is also the client's only warning that a location may be **wedged**: because the
`running` lock is a partial unique index, a stale row blocks the replacement insert regardless of
its age, so a stale run does not self-heal until acquisition reclaims it — see the ingestion guard
note in [Review Pipeline](../review-pipeline/overview.md#pipeline-stages).

The `currentRun.isStale` flag is `PLAN.md` §8.1's 30-minute tolerance made visible. A `running`
row older than 30 minutes (2× the poll interval) is treated as non-blocking by the lock-acquisition
query regardless of what happened to the process that created it, but nothing corrects the row's
own `status` — it stays visually `running` forever until the nightly job sweeps it. Reporting
`isStale` here means the UI shows "last sync failed" rather than a permanent "syncing…".

Nothing in this response is written by this module. Everything on it is set by the pipeline —
including the `needs_reauth` transition, which `PLAN.md` §8.14 puts on the poller's 401/403 path
along with the `sync_runs` error row and `last_sync_status` / `last_sync_error`.

| Field | Type | Rules |
|---|---|---|
| `healthy` | boolean | `true` when `locationStatus = 'active'`, `connectionStatus = 'active'`, and `lastSyncStatus` is `ok` or `null` (never synced yet is not unhealthy). |
| `locationStatus` | string | `location_status` — `active` \| `inactive`. |
| `connectionStatus` | string | `google_connection_status` — `active` \| `needs_reauth`. |
| `lastSyncedAt` | string (ISO) \| null | `locations.last_synced_at`. |
| `lastSyncStatus` | string \| null | `sync_health_status` — `ok` \| `error`. `null` before the first run. Has no `running` value by design. |
| `lastSyncError` | string \| null | `locations.last_sync_error`. |
| `currentRun` | object \| null | The `sync_runs` row currently `status = 'running'` for this location, or `null`. At most one can exist (partial unique index). |
| `livePollingEnabled` | boolean | `onboarding_backfill_completed_at IS NOT NULL`. A location can be perfectly healthy and still not be polled, because backfill hasn't finished (`PLAN.md` §8.2). |

Success `200`:

```json
{
  "locationId": "0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4",
  "healthy": true,
  "locationStatus": "active",
  "connectionStatus": "active",
  "lastSyncedAt": "2026-09-01T14:15:00.000Z",
  "lastSyncStatus": "ok",
  "lastSyncError": null,
  "livePollingEnabled": true,
  "currentRun": {
    "id": "0190f5aa-7b31-7e02-9c44-1d8f3a6b5c20",
    "trigger": "scheduled",
    "startedAt": "2026-09-01T14:30:00.000Z",
    "isStale": false
  }
}
```

Errors: `401`, `404 LOCATION_NOT_FOUND`, `429`.

### `GET /v1/connections/locations/:locationId/sync-runs`

Paginated `sync_runs` history, newest first. `PLAN.md` §2 introduces the table specifically for
"operability of the 15-minute poller — without it, diagnosing 'why didn't review X show up' or
'why did the poller stop' requires log spelunking," and this endpoint is what makes that
diagnosable from the product. No UI renders it today; it is built anyway, because the alternative
answer to a support question is a shell on a production box.

Both `sync_trigger` values appear in the same feed on purpose. Seeing the one-time `backfill` run
in the same list as the `scheduled` runs is how support confirms that backfill actually ran for a
tenant — §7 chose to track the backfill in `sync_runs` rather than a separate one-off table for
exactly this reason. `reviewsFetched` is also the §7 signal for a thin example set: a backfill
that finished `ok` with a low count means the AI's few-shot examples came from fewer than the 50
historical replies `PLAN.md` §5 wants, which is visible here rather than silently degrading
generated replies.

Ordering is by `started_at DESC`, which currently has no supporting composite index — `sync_runs`
indexes `location_id` and `tenant_id` separately, plus the partial unique
`(location_id) WHERE status = 'running'`, but nothing leading with `started_at`. Fine at MVP row
counts, listed in the overview's
[Gap](./overview.md#gap-between-current-code-and-target-design) as a cheap follow-up.

| Query param | Type | Rules |
|---|---|---|
| `page` | integer | Optional, default `1`, min `1`. |
| `pageSize` | integer | Optional, default `20`, max `100`. |
| `status` | string | Optional. `sync_run_status` — `running` \| `ok` \| `error`. Filtering on `error` is the common support query. |
| `trigger` | string | Optional. `sync_trigger` — `scheduled` \| `backfill`. |

Success `200`:

```json
{
  "runs": [
    {
      "id": "0190f5aa-7b31-7e02-9c44-1d8f3a6b5c20",
      "trigger": "scheduled",
      "status": "ok",
      "startedAt": "2026-09-01T14:15:00.000Z",
      "completedAt": "2026-09-01T14:15:07.000Z",
      "reviewsFetched": 3,
      "errorMessage": null
    },
    {
      "id": "0190f4c3-9e07-7d15-a4c8-3f1b6d2e9057",
      "trigger": "backfill",
      "status": "ok",
      "startedAt": "2026-09-01T09:05:03.000Z",
      "completedAt": "2026-09-01T09:11:42.000Z",
      "reviewsFetched": 187,
      "errorMessage": null
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 2
  }
}
```

Errors: `401`, `400` validation (bad `page`/`pageSize`/`status`/`trigger`),
`404 LOCATION_NOT_FOUND`, `429`.

## Error reference

Every error below uses the [error envelope](../auth/api-reference.md#conventions) auth documents.
`message` values come from `src/common/constants/messages.constants.ts` (to be created); `error`
is the category string the frontend branches on.

| Status | Code | Route(s) | When |
|---|---|---|---|
| `400` | `Validation Error` | Any route with a body or query params | A `class-validator` rule failed — `message` is a comma-joined list of the violations. |
| `401` | `Unauthorized` | Every `Bearer` route | Missing, malformed, or expired access token. |
| `403` | `Forbidden` | `authorize`, `DELETE /google`, `POST /locations`, `available-locations` | Authenticated as a `member` on an `@Roles('owner')` route. |
| `403` | `Forbidden` (`TENANT_SUSPENDED`) | Any `Bearer` route | `tenants.status = 'suspended'`. Not instant for a token already issued — `PLAN.md` §8.20. |
| `404` | `Not Found` (`CONNECTION_NOT_FOUND`) | `DELETE /google`, `available-locations`, `POST /locations` | No `review_provider_connections` row for this tenant + provider. Note [`GET /v1/connections`](#get-v1connections) deliberately does **not** use this — "not connected" is a `200` there. |
| `404` | `Not Found` (`LOCATION_NOT_FOUND`) | `backfill`, `sync-health`, `sync-runs` | No `locations` row with this id **for this tenant**. A location belonging to another tenant returns this, not `403`, so the response can't confirm the id exists elsewhere. |
| `404` | `Not Found` (`EXTERNAL_LOCATION_NOT_FOUND`) | `POST /locations` | The `externalLocationId` isn't visible to this connection on the provider's side. |
| `409` | `Conflict` (`CONNECTION_NEEDS_REAUTH`) | `available-locations`, `POST /locations` | `review_provider_connections.status = 'needs_reauth'`, or the provider just returned 401/403 and this request set it (`PLAN.md` §8.14). Frontend should route the owner back through [`authorize`](#get-v1connectionsgoogleauthorize). |
| `409` | `Conflict` (`LOCATION_LIMIT_REACHED`) | `POST /locations` | An `active` location already exists for this tenant. MVP's one-location rule, enforced in the service layer — no database constraint backs it, see the overview's [MVP scope](./overview.md#mvp-scope). |
| `409` | `Conflict` (`BACKFILL_ALREADY_RUNNING`) | `POST /locations` | The partial unique index `UNIQUE (location_id) WHERE status = 'running'` rejected the backfill insert (`PLAN.md` §8.1). Treat as benign: the frontend should proceed to the polling stage. |
| `429` | `Too Many Requests` | Any route | `ThrottlerGuard` limit exceeded. Note the per-route override on [`GET .../backfill`](#get-v1connectionslocationslocationidbackfill) — a 2-second poll against the global 30/min tier fails here. |
| `502` | `Bad Gateway` (`PROVIDER_UNAVAILABLE`) | `available-locations` | The provider API errored for a non-auth reason (outage, rate limit, schema drift). Distinct from `CONNECTION_NEEDS_REAUTH` so the UI offers retry rather than re-consent. |
| `500` | `Internal Server Error` | Any route | Unhandled exception. `traceId` is the only detail safe to show; the rest is server-side, per `ErrorHandlerService`. |

OAuth redirect error codes — appended as `?error=<code>` on the callback's `302`, never JSON,
because the user is mid-browser-navigation (see
[`GET /v1/connections/google/callback`](#get-v1connectionsgooglecallback)):

| Code | When |
|---|---|
| `INVALID_STATE` | The signed `state` failed signature verification or exceeded its TTL — a possible CSRF attempt, or a stale/abandoned consent tab. Checked before `code` is exchanged or anything is written. |
| `ACCESS_DENIED` | The owner declined consent at Google. |
| `PROVIDER_ERROR` | Google returned an `error` param — outage, misconfigured client, revoked app. |
| `ACCOUNT_MISMATCH` | Consent completed as a different Google account than the tenant's existing connection. Nothing is written; a naive upsert would have created a second connection row and silently broken MVP's one-connection rule. |
