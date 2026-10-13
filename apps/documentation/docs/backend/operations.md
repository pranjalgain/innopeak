---
sidebar_position: 2
---

# Operations: running InnoPeak in production

What an operator needs that the feature docs do not say: what must be set, what to probe, what must be running, how to migrate, what to
alert on. Container, CI/CD and cluster manifests are owned by the platform team; this page is the application's side of that contract.

## Processes

Two processes from one codebase, both required:

| Process | Start | Does |
|---|---|---|
| API | `node dist/main.js` (`pnpm api:start:prod`) | HTTP under `/v1` |
| Worker | `node dist/worker.main.js` (`pnpm worker:start:prod`) | Cron ticks, the review-sync, AI-draft and review-post queues, email, dead-letter handling |

**Without a running worker nothing polls Google, drafts replies or posts them**, and the API still looks healthy. Run the worker as its own
deployment. Cron ticks carry a per-minute job id, so several worker replicas collapse into one job per tick on BullMQ (on SQS standard queues
duplicates are possible and tolerated: a repeated poll is wasted quota, not corrupted data).

## Required environment (production)

The app refuses to boot when these are wrong, by design. The full list is `apps/backend/.env.example`; the production-only ones:

| Variable | Rule |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Long, random, different from each other, never the shipped placeholder |
| `GBP_STATE_SECRET`, `GOOGLE_AUTH_STATE_SECRET` | Set |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Set when payments are on |
| `REDIS_PASSWORD` | Set (also used by the rate limiter and the queues) |
| `TRUST_PROXY_HOPS` | **Set explicitly.** Number of proxies in front of the API (`0` only if directly exposed). It sets `req.ip`, which keys the rate limiter |
| `METRICS_TOKEN` | **Set**, 24+ characters. Prometheus must send `Authorization: Bearer <token>` to `/metrics` |
| `DEV_VERIFY_EMAIL_TOKEN` | Must be unset |

Optional tuning: `DB_POOL_MAX` (10), `DB_IDLE_TIMEOUT_MS` (30000), `DB_CONNECTION_TIMEOUT_MS` (5000), `DB_STATEMENT_TIMEOUT_MS` (30000), `DB_SSL`.
Each process holds its own pool, so the database sees roughly `(API replicas + worker replicas) x DB_POOL_MAX` connections.

## Health probes

| Endpoint | Use as | Answers |
|---|---|---|
| `GET /health/live` | Liveness | `200` while the process can answer. Checks no dependency, so a database outage does not restart healthy instances |
| `GET /health` or `/health/ready` | Readiness | `200` when PostgreSQL and Redis are reachable and heap is under 90% of V8's limit; **`503`** otherwise, with the failing component named (never the underlying error) |

Third parties (Google, Stripe, the LLM provider) are deliberately not probed: their outages must not pull an instance out of rotation. The
process also exits at boot if the database is unreachable, so a bad `DATABASE_URL` halts a rollout instead of replacing a working instance.

## Migrating

Deployed environments have no `ts-node` and no `src/`. From the built output:

```bash
pnpm db:migrate:prod          # node dist/db/drizzle/migrate.js
pnpm db:seed:admin:prod       # first platform admin; reads ROOT_ADMIN_EMAIL / ROOT_ADMIN_PASSWORD, idempotent
```

Run the migration **before** the new version takes traffic and **once** per release. Migrations are append-only from the first release
(`pnpm db:migrations:verify`; the workflow is in `apps/backend/docs/conventions/sql-first-workflow.md`).

## Observability

- **Logs**: console only (no log files). Collect container stdout. Production logs at `warn` and above; a 4xx is one `warn` line, a 5xx an
  `error` with a stack.
- **Metrics**: Prometheus text at `/metrics` (token required in production): request counts, durations, errors, concurrency, plus Node defaults.
- **Error IDs**: every error response carries a `traceId` (a per-error UUID) that matches the `[ErrorID: …]` log line. There is no distributed tracing, request-metrics middleware, health page or dev-tools UI; the app is small enough that logs plus `/metrics` suffice.
- **Queues**: Bull Board at `/admin/queues` (platform admins only); failed jobs land in the dead-letter queue.

### Alerts worth having

The infrastructure alerts (CPU, memory, disk, endpoint down) do not see application failure. Add:

| Signal | Why |
|---|---|
| 5xx rate on the API | The API is up but failing |
| `/health/ready` failing | Instance cannot reach PostgreSQL or Redis |
| Dead-letter queue depth > 0 | A job exhausted its retries (a poll, a post, an email) |
| Review-sync jobs failing or no poll completing in 30 min | The worker is down or Google is rejecting us |
| Connections in `needs_reauth` rising | Owners have to reconnect Google; reviews stop importing |
| Stripe webhook non-2xx | Plan changes are not landing; Stripe retries for days, then stops |
| Redis or PostgreSQL connection saturation | Pools are exhausted |

## Failure handling at the edges

| Dependency | Timeout | On failure |
|---|---|---|
| Google (reviews, reply, token refresh) | 15 s | Transient (network, 5xx, 429): reviews sync retries (3 attempts, exponential from 1 min, honoring `Retry-After`); a reply is retried up to 3 times (1 min, 5 min) then marked `post_failed` for the owner to retry. A rejected refresh token (`invalid_grant`) flips the connection to `needs_reauth` and asks the owner to reconnect |
| Google sign-in (OIDC) | 10 s | The sign-in request fails with an error; nothing is stored |
| Stripe | 20 s, 2 automatic retries (idempotency keys make them safe) | A transient Stripe error (connection, 5xx, rate limit, rejected key) answers `503 PAYMENT_PROVIDER_UNAVAILABLE` so clients know to retry. Webhook handler failures roll back and answer non-2xx, so Stripe redelivers |
| LLM provider | per request, no silent retry | Draft generation for that review fails; after 3 failures in a row the batch stops and the next poll retries. Drafting never blocks importing |
| Redis (rate limiter) | n/a | The limiter fails open and logs, so a Redis blip is not an API outage (per-account OTP and login lockouts have their own checks) |

## Backups and recovery

Not something the application can do for you, and easy to forget: enable PostgreSQL point-in-time recovery, test a restore, and write down the
recovery point and time objectives. Redis holds queue state and rate-limit counters only; losing it drops queued jobs (the next poll re-derives
them from Google) but no business data. Secrets live outside the repository (the AWS target hydrates them from Secrets Manager at boot).

## Web app

`NEXT_PUBLIC_SENTRY_DSN` turns error reporting on; there is deliberately no default, so nothing goes to anyone else's project. Events are scrubbed
(no cookies, credentials, query strings or personal identifiers) and session replay is off. There is no analytics or tag manager, so no consent banner. Source maps are uploaded to Sentry at build time and
removed from the build output, never served.
