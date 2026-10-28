---
sidebar_position: 5
---

# Capacity and Scaling

Every number in the code that allocates capacity, in one place, with the file it comes from. Other
pages link here rather than repeating these tables. The second half says how to scale and what limits
each kind of scaling hits first.

## Database connections

Per process, from `apps/backend/src/db/db.service.ts`. Details and the connection formula are in
[Data stores](./data-stores.md#connections).

| Setting | Default |
|---|---|
| `DB_POOL_MAX` | 10 |
| `DB_CONNECTION_TIMEOUT_MS` | 5000 |
| `DB_IDLE_TIMEOUT_MS` | 30000 |
| `DB_STATEMENT_TIMEOUT_MS` | 30000 |

## Queue workers

Each worker is a BullMQ `@Processor` in `apps/backend/src/background`. These settings are per worker
process, so two worker replicas double the effective concurrency.

| Queue | Concurrency | Rate limiter | Stalled check | Retries |
|---|---|---|---|---|
| `email` | 3 | 10 jobs per 150 ms | every 5 min, failed after 3 stalls | each job sets its own |
| `cron` | 3 | 5 jobs per 150 ms | every 5 min, failed after 3 stalls | 1 attempt |
| `review-sync` | 2 | none | every 5 min, failed after 2 stalls | backfill 2 attempts, a poll is retried by the next tick |
| `review-post` | 3 | none | every 5 min, failed after 2 stalls | 1 attempt. Recovery is the owner's Retry |
| `dead-letter` | 1 (BullMQ default) | none | default | 1 attempt |

Job retention, from `QUEUE_JOB_OPTIONS` in `job.constant.ts`:

| Queue | Completed jobs kept | Failed jobs kept |
|---|---|---|
| `cron` | 1 day | not kept |
| `email` | 1 day | not kept (the payload holds a one-time code) |
| `review-post` | 7 days | 7 days |
| `dead-letter` | 7 days | 60 days |
| `review-sync` | 7 days, except a completed poll, which is dropped after 1 hour | 7 days |

Every queue above replaces the project-wide default (`DEFAULT_JOB_OPTIONS`: 3 attempts, exponential
backoff from 1 minute, completed jobs kept a day, failed jobs a week), so a job gets more than one
attempt only where the table says so.

### SQS (when `DEPLOYMENT_TARGET=aws`)

| Setting | Value | Where |
|---|---|---|
| Messages per receive | 1 | `sqs-queue-consumer.base.ts` |
| Long-poll wait | 20 s | same |
| Visibility timeout | 60 s, re-extended every 30 s while a job runs | same, and `infra/floci/sqs.tf` |
| Receives before redrive to the `-dlq` | 3 | same, and `sqs.tf` |
| Error backoff | 1 s, doubling to a 60 s cap | same |
| Shutdown wait for the job in hand | 25 s | same |
| `-dlq` retention | 14 days | `sqs.tf` |

The visibility timeout, the receive count and the Terraform values must be changed together.

## Rate limits

Counters are kept in Redis, so every API replica shares one allowance per client address
(`apps/backend/src/app.module.ts`). A request is counted in every tier at once, and is refused when
any tier is exhausted.

| Tier | Window | Requests |
|---|---|---|
| `short` | 1 minute | 30 |
| `medium` | 5 minutes | 100 |
| `long` | 30 minutes | 500 |
| `very-long` | 1 hour | 1000 |

Most routes replace the `short` tier with their own limit per minute. The sensitive ones:

| Route | Per minute |
|---|---|
| Sign-in (`POST /v1/auth/login`, and the admin one) | 10 |
| Sign-up, resend code, change or set password, account deletion and restore, accept invitation | 5 |
| Verify email | 10 |
| Refresh session | 20 |
| Start Google or Microsoft sign-in | 10 |
| Post, retry, or write a reply | 10, 10 and 20 |
| Data export | 3 |
| Onboarding backfill progress poll | 120 (the other tiers are skipped for it) |
| Stripe webhook | not limited |

If Redis does not answer within 500 ms the limiter lets the request through and logs it. Behind a
proxy, `TRUST_PROXY_HOPS` must equal the number of proxies that append to `X-Forwarded-For`, otherwise
the counter keys on the wrong address. See the [Configuration reference](../services/configuration-reference.md).

## Timeouts and caps

| Limit | Value | Where |
|---|---|---|
| AI request | 30 s, no retries, 400 output tokens per draft | `api/ai/constants/ai.constants.ts` |
| Adding a job to a queue | 5 s, then the request answers 503 | `background/queue-add-manager.ts` |
| Redis calls on a request path (sign-out marks, SQS de-duplication, rate limiter) | 500 ms, then fail open | `session-revocation.service.ts`, `redis-throttler.storage.ts`, `sqs-queue.publisher.ts` |
| Google, Stripe and sign-in calls | 15 s, 20 s (2 retries) and 10 s | [Failure handling at the edges](../backend/operations.md#failure-handling-at-the-edges) |
| Request body | 1 MB (JSON), 256 kB (Stripe webhook) | `bootstrap.ts` |
| Live notification stream | heartbeat every 25 s, closed after 30 min | `api/notifications/realtime` |
| Active locations per business | 50 | `MAX_ACTIVE_LOCATIONS` |
| Pages read in one review poll | 200, then the poll stops and is flagged | `review-sync-queue.service.ts` |
| Free plan | 1 location, 20 AI drafts a month, 1 team member | [Business settings](../services/business-settings.md#plan-limits) |

## How to scale

### API

Stateless, so add replicas freely. The limits you will meet, in order:

1. **Database connections.** Each replica adds `DB_POOL_MAX` connections. Check
   `max_connections` first.
2. **The shared rate limit** is per client address, not per replica, so adding replicas does not
   raise anyone's allowance.
3. **CPU** matters little: most requests are small reads.

### Worker

Add replicas for availability, not for speed. Scheduled ticks are deduplicated by job id (per minute,
in Redis) so duplicates collapse. What actually limits throughput is outside the worker:

- **Google's API quota.** Review-sync concurrency is 2 per worker on purpose. A poll that hits a rate
  limit waits for `Retry-After` and is retried by the next cycle. More workers means a faster path to
  the quota, not more reviews.
- **The AI provider's rate limits.** Drafts are generated after import, and after three failures in a
  row the batch stops until the next poll.
- **Email rate**: each worker sends at most 10 emails per 150 ms. Check this against the sending limit of the mail provider before raising worker replicas.

On SQS, ticks are deduplicated through Redis, but a Redis failure publishes anyway: a duplicate poll is
wasted quota, not corrupted data.

### Web app

Stateless. Add replicas for availability and traffic. Each holds long-lived connections for the
notification stream (a heartbeat every 25 s, closed after 30 minutes), so count open connections per
replica when sizing the load balancer's idle timeout: it must be longer than 25 seconds.

### Growth to watch

| Signal | Where to look | Action |
|---|---|---|
| Database connections near `max_connections` | Database metrics | Lower `DB_POOL_MAX`, add a pooler (session mode) or a larger instance |
| Review-sync jobs taking longer than 15 minutes, or a growing waiting count | Queue dashboard | Check Google quota first, then add a worker |
| Dead-letter entries appearing | Queue dashboard | Read the failure, then fix or retry |
| Redis memory climbing | Redis metrics | Check job retention, and that the eviction policy is `noeviction` |
| Locations per business approaching 50 | Business data | The cap is `MAX_ACTIVE_LOCATIONS`, raise it in code with the Google quota in mind |
