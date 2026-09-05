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
| Notifications | Escalation delivery records and the in-app notification centre | [Overview](./notifications/overview.md) · [API](./notifications/api-reference.md) |
| Dashboard | Read-only aggregate metrics over reviews and responses | [Overview](./dashboard/overview.md) · [API](./dashboard/api-reference.md) |
| Platform Admin | Cross-tenant support and operations for GeekyAnts staff | [Overview](./platform-admin/overview.md) · [API](./platform-admin/api-reference.md) |
| Review Pipeline | The worker side: ingestion, classification, generation, notification, posting, retention | [Overview](./review-pipeline/overview.md) |

## Reading these docs

Two things to know before relying on any of them.

**They document the target design, not shipped code.** `apps/backend/src/` is still largely the
generic NestJS boilerplate this project started from: none of the modules above exist yet, the
InnoPeak migrations are written but `src/db/drizzle/schema.ts` has not been regenerated from them,
and the only working auth is the boilerplate's. Every module doc carries a "Gap between current
code and target design" section listing exactly what has to be built or changed. Start there
before writing code against any contract.

**Every schema claim is checkable.** Table, column, enum, index and constraint references point at
`apps/backend/src/db/drizzle/migrations/*.sql`, and where a module needs something the schema does
not have, the doc says so explicitly and specifies the follow-up migration rather than assuming
it. Those follow-ups are not yet consolidated into a single numbered plan — several modules
propose migrations against tables another module owns.

## Conventions

Implementation conventions are documented with the code, in `apps/backend/docs/conventions/`:

- `module-structure.md` — the module layout (`src/api/<module>/`) and the four-layer request flow,
  Controller → Service → DB Service → Repository
- `api-patterns.md` — versioning, Swagger, response envelope, DTOs, pagination
- `sql-first-workflow.md` — write raw SQL migrations, then regenerate the Drizzle schema
- `provider-pattern.md`, `testing-patterns.md`

New modules are documentation-first: write the module's `overview.md` and `api-reference.md` here
and get them confirmed before implementation starts.
