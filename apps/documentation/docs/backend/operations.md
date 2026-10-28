---
sidebar_position: 2
---

# Operations: running InnoPeak in production

What an operator needs that the feature docs do not say: what must be set, what to probe, what must be running, how to migrate, what to
alert on. Container, CI/CD and cluster manifests are owned by the platform team; this page is the application's side of that contract.
For the infrastructure itself (sizing, environments, secrets, monitoring, releases) see the [Infrastructure](../infrastructure/overview.md)
section, and for every environment variable the [Configuration reference](../services/configuration-reference.md).

## Processes

Two processes from one codebase, both required:

| Process | Start | Does |
|---|---|---|
| API | `node dist/main.js` (`pnpm api:start:prod`) | HTTP under `/v1` |
| Worker | `node dist/worker.main.js` (`pnpm worker:start:prod`) | Cron ticks, the review-sync queue (which also drafts replies), the review-post queue, email, dead-letter handling |

**Without a running worker nothing polls Google, drafts replies or posts them**, and the API still looks healthy. Run the worker as its own
deployment. Cron ticks carry a per-minute job id, so several worker replicas collapse into one job per tick on BullMQ (on SQS standard queues
duplicates are possible and tolerated: a repeated poll is wasted quota, not corrupted data). The worker has no HTTP port, so it has no
probe endpoint. Set `TZ=UTC` on it: the API pins UTC in code, the worker does not, and it fires the schedule.

## Required environment (production)

The app refuses to boot when these are wrong, by design. The full list is `apps/backend/.env.example`; the production-only ones:

| Variable | Rule |
|---|---|
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Long, random, different from each other, never the shipped placeholder |
| `GBP_STATE_SECRET`, `GOOGLE_AUTH_STATE_SECRET` | Set |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Set when payments are on |
| `REDIS_PASSWORD` | Set (also used by the rate limiter and the queues) |
| `TRUST_PROXY_HOPS` | **Set explicitly.** Number of proxies in front of the API (`0` only if directly exposed). It sets `req.ip`, which keys the rate limiter |
| `METRICS_TOKEN` | **Set**, 24+ characters. Prometheus must send `Authorization: Bearer <token>` to `/metrics`. Without it `/metrics` answers 503 everywhere except a local machine (a staging box runs as `development`, so it is not exempt) |
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
- **Metrics**: Prometheus text at `/metrics` (token required in production). It carries the Node process defaults and one custom counter,
  `platform_activity_dropped_total`. **There are no request counts, durations, error rates or concurrency metrics.**
- **Error IDs**: every error response carries a `traceId` (a per-error UUID) that matches the `[ErrorID: …]` log line. There is no distributed tracing, request-metrics middleware, health page or dev-tools UI.
- **Queues**: Bull Board at `/admin/queues` (platform admins only, read-only outside local development); failed jobs land in the dead-letter queue.

The monitoring stack, the full signal list and the alerts worth having, with the source each can use today, are on
[Observability](../infrastructure/observability.md).

## Failure handling at the edges

| Dependency | Timeout | On failure |
|---|---|---|
| Google (reviews, reply, token refresh) | 15 s | Transient (network, 5xx, 429): reviews sync retries (3 attempts, exponential from 1 min, honoring `Retry-After`); a reply is retried up to 3 times (1 min, 5 min) then marked `post_failed` for the owner to retry. A rejected refresh token (`invalid_grant`) flips the connection to `needs_reauth` and asks the owner to reconnect |
| Google sign-in (OIDC) | 10 s | The sign-in request fails with an error; nothing is stored |
| Stripe | 20 s, 2 automatic retries (idempotency keys make them safe) | A transient Stripe error (connection, 5xx, rate limit, rejected key) answers `503 PAYMENT_PROVIDER_UNAVAILABLE` so clients know to retry. Webhook handler failures roll back and answer non-2xx, so Stripe redelivers |
| LLM provider | per request, no silent retry | Draft generation for that review fails; after 3 failures in a row the batch stops and the next poll retries. Drafting never blocks importing |
| Redis (rate limiter) | n/a | The limiter fails open and logs, so a Redis blip is not an API outage (per-account OTP and login lockouts have their own checks) |

## Queue job defaults

`QUEUE_JOB_OPTIONS` (`background/constants/job.constant.ts`) is the single source of each queue's job defaults, applied both where a queue backs its
worker and Bull Board and where `QueueTransportModule` registers it for publishing. It used to be written only on the first, so everything published
got the project defaults (3 attempts, failed jobs kept a week): review-post jobs were retried blindly, cron ticks retried, and failed email jobs kept
their OTP payload. Now: **cron** 1 attempt, no failed job kept; **review-post** 1 attempt (a stale retry would replay an old decision; the owner's
`retry-post` is the recovery); **email** failed jobs removed at once, attempts set per job; **dead-letter** 1 attempt, 7 days / 60 days retention.
**review-sync** registers no job defaults on the publisher side (only a 7-day completed-job retention, so one attempt); a backfill passes `attempts: 2` itself, and a poll that fails is simply retried by the next 15-minute tick. A job BullMQ fails for stalling past `maxStalledCount` is retired by `onStalled` (see the auth hardening notes).

## The SQS consumer (AWS deployments)

`SqsQueueConsumerBase` replaces BullMQ's worker with a long-polling loop, one message at a time. Its settings mirror `infra/floci/sqs.tf`
(`SQS_VISIBILITY_TIMEOUT_SECONDS = 60`, `SQS_MAX_RECEIVE_COUNT = 3`); change them together.

- **Receive errors back off** (1 s doubling to 60 s, reset by the next successful receive) rather than retrying at once, so a queue that is
  down is not a hot loop and a flood of identical error lines.
- **A message that is not JSON is that message's failure**: the body is parsed inside the same `try` as processing, so it is left for redrive like any
  failed job and never surfaces as a poll-loop error.
- **A running job keeps its message hidden.** Every 30 s (half the timeout) `ChangeMessageVisibility` re-hides it for another 60 s until the job
  ends. Without it a job over 60 s (the erasure purge, a poll fan-out) was offered to another consumer, ran twice, and its success was still redriven
  to the `-dlq` after three receives. A failed extension is logged and the job carries on.
- **The dead-letter dashboard lists a failure once**, on its last receive (`ApproximateReceiveCount >= 3`); earlier receives are about to be
  retried. The `-dlq` itself still holds the raw body for 14 days; a payload with a code or an invite link should not rely on SQS retention, which
  is why those jobs are redacted on the BullMQ path.

## Platform hardening notes (audit follow-ups)

- **Readiness is cached for 2 s.** `GET /health` (public, unthrottled) used to query the database and Redis on every request; concurrent and repeated probes
  now share one check (`READINESS_CACHE_MS`). A load balancer polling every few seconds sees no difference.
- **A repeated `state` query parameter is rejected, not a 500.** Express hands `?state=a&state=b` over as an array; both OAuth state verifiers now treat a
  non-string as invalid.
- **A body-parser rejection is logged as the 4xx it is.** Malformed JSON or an over-limit body (`expose: true`, 4xx) is a warning, not a 500 with a stack.
- **The Stripe webhook body is capped at 256 kb**, stated explicitly (it was body-parser's unstated 100 kb default), as a bound on what an unauthenticated caller
  can make that route buffer before the signature is checked.
- **`GBP_STATE_SECRET` is at least 32 characters when set**, and the public development fallback for the pending-account key is used only on a local setup
  (`isLocalDevelopment()`), not on any box that merely runs as `development`.
- **`DEV_VERIFY_EMAIL_TOKEN` also needs a non-blank `FRONTEND_URL`.** A blank URL reads as "local" elsewhere; with a fixed sign-up code that case is refused at boot.
- **`TRUST_PROXY_HOPS` counts only proxies that append to `X-Forwarded-For`.** The web app's `/v1` rewrite does not, so counting it lets a client send its own
  header and pick its rate-limit bucket (see `.env.example`).

## Worker robustness notes (audit follow-ups)

- **A job id is honoured on SQS.** A standard SQS queue cannot ignore a repeated message, so every worker replica's `@Cron` tick became its own message (N polls of every
  location against Google's quota every 15 minutes). `SqsQueuePublisher` now claims `sqs-publish-dedupe:<queue>:<jobId>` in Redis (`SET NX EX 300`) and skips a
  message whose id was already published; a Redis failure publishes anyway (a duplicate beats a lost job). `QueueTransportModule` imports `RedisModule` for this.
- **Review polls are deduplicated and short-lived.** `ReviewSyncQueue.addPollJob` uses an id carrying the location and a ten-minute window (a second enqueue of the same tick is
  ignored) and drops a completed poll after an hour instead of the queue's week.
- **A worker event handler cannot kill the process.** The `failed` handlers (cron, email, review-post) catch a failed dead-letter write and log it; `worker.main.ts` also
  logs an unhandled rejection instead of letting Node's default end the process that serves every queue.
- **A connection that could not release an advisory lock is discarded.** `runWithErasurePurgeLock` takes session locks on one pooled connection; if an unlock query failed,
  the connection used to go back to the pool still holding the lock. It is now released with `release(true)`, which closes it and frees every lock it held.
- **Logged errors show their stack.** `LoggerService.error(message, trace)` accepted a stack and the console format dropped it; it is printed under the message now.

## Backups and recovery

Not something the application can do for you, and easy to forget: enable PostgreSQL point-in-time recovery, test a restore, and write down the
recovery point and time objectives. Redis holds queue state, rate-limit counters and sign-out marks, and **outside production the encrypted Google
refresh tokens**; losing it drops queued jobs (the next poll re-derives them from Google), and outside production forces every owner to reconnect
Google, but loses no business data. Turn Redis persistence on. Secrets live outside the repository (the AWS target hydrates them from Secrets
Manager at boot). See [Data stores](../infrastructure/data-stores.md#backups-and-recovery).

## Web app

`NEXT_PUBLIC_SENTRY_DSN` turns error reporting on; there is deliberately no default, so nothing goes to anyone else's project. Events are scrubbed
(no cookies, credentials, query strings or personal identifiers) and session replay is off. There is no analytics or tag manager, so no consent banner. Source maps are uploaded to Sentry at build time and
removed from the build output, never served.

## `FRONTEND_URL` on every non-local box

"Local development" (the fixed sign-up code, invite links in the log, open Swagger and Bull Board, raw database errors, an open `/metrics`) means not production **and** a loopback `FRONTEND_URL`, and an *unset* `FRONTEND_URL` counts as loopback (a bare laptop setup). A staging box running as `development` must therefore set `FRONTEND_URL` to its real address; the same variable builds the links in every email, so a box without it is broken anyway.
