---
sidebar_position: 3
---

# Worker and Jobs

The worker does everything that should not make a user wait. When a business connects Google, when a
review arrives, when a reply is approved, when an invitation has to be emailed, and every night for
housekeeping, the work lands here. Without a running worker the consoles still open, but nothing new
arrives.

It starts from `apps/backend/src/worker.main.ts`, boots a Nest application context (no web server),
and loads `WorkerModule` (`apps/backend/src/worker.module.ts`): the database, Redis, the Google review
provider, the review pipeline, in-app notifications, and `BackgroundModule` with every queue consumer
and the scheduler. Because it has no web server it has **no health or metrics endpoint**.

## Queues

Five queues carry the work (`QueueName` in `apps/backend/src/background/constants/job.constant.ts`).

| Queue | Jobs | Carries | Transport |
|---|---|---|---|
| `email` | `email-otp-verification`, `admin-set-password-otp-email`, `admin-invite-email`, `member-invite-email`, `erasure-notice-email`, `erasure-purge-alert-email`, `locations-paused-email` | Every outgoing email | BullMQ, or SQS when `DEPLOYMENT_TARGET=aws` |
| `review-sync` | `review-backfill`, `review-poll` | Importing reviews from Google, classifying them, drafting replies | **BullMQ in every environment** |
| `review-post` | `review-post` | Publishing an approved reply to Google | BullMQ, or SQS |
| `cron` | the seven scheduled jobs below | The nightly and periodic housekeeping | BullMQ, or SQS |
| `dead-letter` | `dlq_failed_job` | A record of jobs that failed for good, shown in the queue dashboard | BullMQ, or SQS |

The numbers that size the worker (concurrency, limiters, retries, stall detection) live in one place:
[Capacity and scaling](../infrastructure/capacity-and-scaling.md#queue-workers).

### What a failed job does

- Each queue sets its own retry rules (`QUEUE_JOB_OPTIONS`). Email jobs choose their own attempts when
  they are published. Cron and review-post jobs are tried **once**: a blind retry of a post would
  replay a stale decision, so recovery is the owner pressing **Retry** in the console.
- A job that fails for good is copied to the `dead-letter` queue.
- Email jobs are not kept after they fail, because their payload contains a one-time code.
- With SQS, a message that fails is left in place, and SQS moves it to the matching `-dlq` queue after
  three receives. The dead-letter dashboard entry is written only on that last receive.

## Scheduled jobs

Seven jobs are scheduled in `apps/backend/src/background/cron/cron.scheduler.ts`. Each tick adds a job
to the `cron` queue with an id built from the job name and the minute, so several worker replicas
running the same schedule add one job, not several.

| Schedule | Job | What it does |
|---|---|---|
| Every 15 minutes | `review-sync-poll` | Adds a `review-poll` job for every eligible location: active, backfilled, connected through a healthy (not `needs_reauth`) connection, belonging to a business that is not suspended or erased, and not paused for plan limits |
| Daily 00:00 | `daily-mail` | A placeholder. It only writes a log line |
| Daily 02:00 | `reviewer-retention-purge` | Removes the reviewer's name and external reviewer id from reviews older than a business's `review_data_retention_months`, for businesses that set one. The rating, text and classification stay |
| Daily 03:00 | `auth-token-cleanup` | Deletes used or expired verification codes, revoked or expired refresh tokens, and sign-ups that were never verified |
| Daily 03:30 | `notification-retention-purge` | Deletes bell notifications: read ones after 90 days, unread ones after 180 |
| Daily 04:00 | `erasure-purge` | The GDPR sweep. After `ERASURE_GRACE_PERIOD_DAYS` (21 by default) it erases businesses and team members that asked to be deleted, sends the notice and reminder emails, and emails every active platform admin if anything had to be skipped |
| Daily 05:00 | `billing-reconciliation-sweep` | Three independent steps, each run even if an earlier one failed: reconcile Free businesses that have a Stripe customer but never returned from checkout, retry cancelling Stripe billing for businesses pending erasure, and delete processed Stripe webhook records older than 90 days |

### Time zone

The schedule is written in the process's local time. The API pins itself to UTC (`process.env.TZ`
in `main.ts`), but **the worker does not**, and the worker is the process that fires these jobs. A
container normally defaults to UTC, which is what the times above assume. Set `TZ=UTC` explicitly on
the worker so a base-image or host change cannot move the nightly jobs. This is tracked in
[Open items](../infrastructure/open-items.md).

## How a Google review becomes a reply

1. **Backfill.** After an owner confirms a location, the API adds one `review-backfill` job. It
   imports the location's existing reviews.
2. **Poll.** Every 15 minutes the schedule adds a `review-poll` job per eligible location (deduplicated
   within a 10-minute window). A poll imports new reviews. It stops at 200 pages, which no real
   interval should reach. Location details refresh at most once a day.
3. **Classify.** Each review is checked against the business's blocklist and escalation threshold.
   It becomes either an escalation for a person or a candidate for an AI reply.
4. **Draft.** The AI provider writes one to three drafts from the business's prompt. A draft that
   contains a link, a phone number other than the business's own, an email address or placeholder text
   is never published without a person reading it.
5. **Notify.** Owners and members get a bell notification when something needs them.
6. **Post.** When a reply is approved, the API adds a `review-post` job and the worker publishes it to
   Google. Automatic posting exists in the code (`autoPostEnabled`) but is off by default and has no
   control in the console yet. Escalated reviews are never auto-posted.

The full pipeline, with its failure rules, is described in [Review pipeline](../backend/review-pipeline/overview.md).

## Running it

| Command | Use |
|---|---|
| `pnpm worker:start:prod` | Start the compiled worker (`node dist/worker.main.js`) |
| `pnpm start:dev` | Start the API and the worker together for development |

In a container, run the backend image with the command `node dist/worker.main.js`. That image's
built-in `HEALTHCHECK` calls the API's `/health` and can never pass for a worker, so a worker
container needs its own health check or none. See [Compute and containers](../infrastructure/compute-and-containers.md).

On shutdown the worker stops taking new jobs and gives the message in hand up to 25 seconds to finish
(SQS consumers). A job that does not finish is offered again when its visibility timeout expires.
