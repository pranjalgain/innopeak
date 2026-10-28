---
sidebar_position: 2
---

# Backend API

The API is the one service every user request passes through. It checks who is calling, applies the
business rules, reads and writes the database, and hands slow work to the [worker](./worker-and-jobs.md)
through a queue. It starts from `apps/backend/src/main.ts` and listens on `0.0.0.0:$PORT` (3000 by
default).

## Modules it hosts

Each module has its own overview and API reference in the Backend section. Paths are relative to
`apps/backend/src`.

| Module | What it does | Docs |
|---|---|---|
| Auth (`api/auth`) | Sign-up, email verification, sign-in with password, Google or Microsoft, tokens, member and admin invitations, account deletion | [Auth](../backend/auth/overview.md) |
| Connections (`api/connections`) | Connects a business's Google Business Profile, chooses locations, reports sync health | [Connections](../backend/connections/overview.md) |
| Reviews (`api/reviews`) | Review list and detail, and the reply lifecycle: approve, reject, edit, write by hand, post, retry | [Reviews](../backend/reviews/overview.md) |
| Prompts (`api/prompts`) | The reply instructions a business owner edits, with versions and tone | [Prompts](../backend/prompts/overview.md) |
| AI (`api/ai`) | Drafts replies with a language model. It has no HTTP routes; the worker calls it | [AI](../backend/ai/overview.md) |
| Settings (`api/settings`) | Business settings, blocklist, notification recipients, team members, data export, and the public platform configuration | [Settings](../backend/settings/overview.md) |
| Notifications (`api/notifications`) | The in-app bell: list, mark read, and a live stream | [Notifications](../backend/notifications/overview.md) |
| Dashboard (`api/dashboard`) | Totals and recent escalated reviews | [Dashboard](../backend/dashboard/overview.md) |
| Billing (`api/billing`) | Free and Paid plans, Stripe checkout and portal, receipts, plan limits, the Stripe webhook | [Billing](../backend/billing/overview.md) |
| Media (`api/media`) | Profile pictures, uploaded straight to Cloudinary and confirmed by the server | [Media](../backend/media/overview.md) |
| Admin (`api/admin`) | The platform-admin console: businesses, users, overview, statistics, billing views, platform settings, admin invitations | [Admin overview](../backend/admin-overview/overview.md), [Admin management](../backend/admin-management/overview.md), [Admin billing](../backend/admin-billing/overview.md) |
| Health (`api/health`) | Liveness and readiness probes | [Health probes](../backend/operations.md#health-probes) |
| Metrics (`api/metrics`) | Prometheus metrics | [Observability](../infrastructure/observability.md) |

The API also loads the queue publishers, the Bull Board dashboard, and a start-up task that re-applies
the Free plan's location limit once each time an API process boots (`FreePlanCapModule`).

## What every request goes through

In order, as set up in `apps/backend/src/bootstrap.ts`:

1. **Security headers** (helmet) on every response.
2. **Compression**, switched off for the live notification stream, because compression would hold
   back its events.
3. **Cookie parsing**, so the refresh token can be read on refresh and logout.
4. **Queue dashboard guard.** Requests to `/admin/queues` are refused unless they carry a valid
   platform-admin token. It runs before routing, because Bull Board is an Express sub-application
   that the normal guards never reach.
5. **Metrics guard.** `/metrics` needs `Authorization: Bearer $METRICS_TOKEN` in production.
6. **CORS.** Only the origins listed in `CORS_ORIGINS` may make credentialed requests.
7. **Body parsing.** The Stripe webhook route keeps the raw bytes (limit 256 kB) so its signature can
   be verified. Every other route takes JSON only, limit 1 MB.
8. **Versioning.** Business routes live under `/v1`. Health and metrics are version-neutral.
9. **Rate limiting, then authentication, then roles**, in that order, as global guards. See
   [Roles and permissions](./roles-and-permissions.md).
10. **Validation.** Request bodies are validated against their DTO. Unknown fields are rejected, not
    silently dropped.

Rate limits are counted in Redis, so every API replica shares one allowance. The tiers are in
[Capacity and scaling](../infrastructure/capacity-and-scaling.md#rate-limits).

## Probes and operational endpoints

| Endpoint | Who may call it | Purpose |
|---|---|---|
| `GET /health/live` | anyone | Answers 200 while the process can serve a request. Checks no dependency, so a database outage does not get a healthy instance restarted |
| `GET /health` and `GET /health/ready` | anyone | Answers 200 when the database and Redis are reachable and heap use is under 90% of its limit, otherwise 503. Third-party services are not probed |
| `GET /metrics` | bearer `METRICS_TOKEN` (open on a developer machine) | Prometheus text. See [Observability](../infrastructure/observability.md) |
| `/admin/queues` | platform admins only | Bull Board: inspect waiting, active, failed and dead-lettered jobs. Every queue is read-only except on a developer machine, so jobs cannot be retried or deleted from it in a deployed environment |
| `/api/v1` | local development only | Swagger documentation. It is not mounted anywhere else |
| `GET /` | anyone | A plain landing page. In production it only says the URL is wrong |

## Shutdown

The API enables Nest shutdown hooks, so a `SIGTERM` from the orchestrator lets in-flight requests
finish and closes the database and Redis connections cleanly.

## Related

- [Configuration reference](./configuration-reference.md) for every environment variable
- [Services overview](./overview.md) for how the API fits with the other services
