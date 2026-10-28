# Backend Application

## Overview

`apps/backend` is the InnoPeak API and worker: a NestJS 11 service on PostgreSQL via Drizzle
(SQL-first migrations), with BullMQ/SQS background jobs. It ingests Google Business Profile
reviews on a poll, classifies them against a per-tenant rating threshold and blocklist, drafts
replies with Azure OpenAI, holds every reply for human approval, and escalates risky reviews to a
responsible employee.

The authoritative design documents live alongside the code rather than here:
`apps/backend/docs/PLAN.md` (the MVP design — ER diagram, schema rationale, GDPR retention, and
the §8 concurrency catalogue every module doc cites by section number) and
`apps/backend/docs/schema.dbml`. The module docs below turn those decisions into per-module
architecture and endpoint contracts.

## Module documentation

Each module has an **overview** (objectives, data model, flows, and the gap between the current
code and the target design) and an **API reference** (endpoint-by-endpoint request/response
contracts). The pipeline has no HTTP surface, so it has an overview only.

| Module | Covers | Docs |
|---|---|---|
| Auth | Tenant users and platform admins: SSO, password, social auth, invites, sessions | [Overview](./auth/overview.md) · [API](./auth/api-reference.md) |
| Connections | Google Business Profile OAuth, locations, sync health, backfill progress | [Overview](./connections/overview.md) · [API](./connections/api-reference.md) |
| Reviews | The review queue, review detail, and AI reply-draft approve/edit/reject | [Overview](./reviews/overview.md) · [API](./reviews/api-reference.md) |
| Prompts | Versioned reply prompts, per-owner tone, prompt performance | [Overview](./prompts/overview.md) · [API](./prompts/api-reference.md) |
| Settings | Tenant profile, escalation threshold, blocklist, notification recipients | [Overview](./settings/overview.md) · [API](./settings/api-reference.md) |
| Media | Stored assets: direct-to-provider profile avatar upload for tenant users and platform admins | [Overview](./media/overview.md) · [API](./media/api-reference.md) |
| Notifications | Escalation delivery records and the in-app notification centre | [Overview](./notifications/overview.md) · [API](./notifications/api-reference.md) |
| Dashboard | Read-only aggregate metrics over reviews and responses | [Overview](./dashboard/overview.md) · [API](./dashboard/api-reference.md) |
| Admin Overview | Super Admin landing screen: stat cards, recent/at-risk businesses, signup trend, activity log | [Overview](./admin-overview/overview.md) · [API](./admin-overview/api-reference.md) |
| Platform Admin | Cross-tenant support and operations for GeekyAnts staff | [Overview](./platform-admin/overview.md) · [API](./platform-admin/api-reference.md) |
| Billing | Free/Paid subscription plans via Stripe, entitlement enforcement, and the deploy-level `PAYMENT_FEATURE_ENABLED` switch | [Overview](./billing/overview.md) · [API](./billing/api-reference.md) |
| Admin Management | Super Admin Businesses (suspend/reactivate, GDPR erasure request/cancel) and Users screens, with server-side search and paging | [Overview](./admin-management/overview.md) · [API](./admin-management/api-reference.md) |
| Admin Billing | Super Admin read-only window into plan mix, subscription health and Stripe webhook activity | [Overview](./admin-billing/overview.md) · [API](./admin-billing/api-reference.md) |
| Review Pipeline | The worker side: ingestion, classification, generation, notification, posting, retention | [Overview](./review-pipeline/overview.md) |

## Reading these docs

Two things to know before relying on any of them.

**They describe the code as built, with the gaps called out.** The modules above exist in
`apps/backend/src/api/`, and `src/db/drizzle/schema.ts` is generated from the migrations. Each
`api-reference.md` opens by saying whether it documents the implemented behaviour or an original
spec, and module overviews end with a "Gap between current code and target design" or "Known
limitations" section listing what is not built. Platform Admin is the one module whose spec is still
only partly built. Read that section before writing code against a contract.

**Every schema claim is checkable.** Table, column, enum, index and constraint references point at
`apps/backend/src/db/drizzle/migrations/*.sql`, and where a module needs something the schema does
not have, the doc says so explicitly and specifies the follow-up migration rather than assuming
it.

## Cross-cutting behaviour

Running it in production (processes, required variables, probes, migrating, alerts) is in [Operations](./operations.md).
What each service does, every environment variable and every setting is in [Services](../services/overview.md). Servers, sizing, secrets,
monitoring and releases are in [Infrastructure](../infrastructure/overview.md).

- **Localized messages.** Every user-facing string, including validation errors, is rendered in the caller's locale at the response edge
  ([Multilingual](../meta/multilingual.md)); both `messages.en.ts` and `messages.de.ts` are required.
- **Log levels.** A request answered with a 4xx is one `warn` line (no stack) from `HttpExceptionFilter`; only a
  5xx is an `error` with a stack. Expected refusals (an expired account choice `410`, a lapsed token `401`, a throttled `429`) are not faults.
- **Deploy-level values.** Settings that come from the environment (`PAYMENT_FEATURE_ENABLED`, `ERASURE_GRACE_PERIOD_DAYS`) are reflected on
  the public `GET /v1/settings/platform-config` ([Settings API](./settings/api-reference.md#platform-config)); there is no second copy in a table.
- **Failure handling at the edges.** Every outbound call has a timeout (Google 15 s, Stripe 20 s with automatic retries, Google sign-in 10 s); a
  transient Stripe failure answers `503 PAYMENT_PROVIDER_UNAVAILABLE`; Google failures are retried by the queues or surfaced to the owner
  (`post_failed`, `needs_reauth`). Rate-limit counters live in Redis so replicas share one budget. The database pool is bounded, and a failed
  database connection at boot stops the process. Details: [Operations](./operations.md#failure-handling-at-the-edges).
- **Health.** `/health/live` (process only) and `/health/ready` (PostgreSQL, Redis, heap; HTTP 503 when down) are separate on purpose.
- **Idempotent actions.** Webhooks go through an idempotency ledger and a per-tenant event clock; repeated admin actions return the same outcome
  without duplicating logs, emails or Stripe calls.

## Conventions

Implementation conventions are documented with the code, in `apps/backend/docs/conventions/`:

- `module-structure.md` — the module layout (`src/api/<module>/`) and the four-layer request flow,
  Controller → Service → DB Service → Repository
- `api-patterns.md` — versioning, Swagger, response envelope, DTOs, pagination
- `sql-first-workflow.md` — write raw SQL migrations, then regenerate the Drizzle schema
- `provider-pattern.md`, `testing-patterns.md`

New modules are documentation-first: write the module's `overview.md` and `api-reference.md` here
and get them confirmed before implementation starts.
