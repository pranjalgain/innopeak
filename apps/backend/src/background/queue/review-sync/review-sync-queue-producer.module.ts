import { QueueName } from '@bg/constants/job.constant';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

/**
 * Kept longer than the email queue's: "did this tenant's backfill actually run, and what did it
 * do" is a support question that gets asked days later, and the Bull Board record is the fastest
 * answer that isn't a database query.
 */
const reviewSyncQueueBullModule = BullModule.registerQueue({
  name: QueueName.REVIEW_SYNC,
  streams: { events: { maxLen: 1000 } },
  defaultJobOptions: {
    removeOnFail: { age: 7 * 24 * 3600 },
    removeOnComplete: { age: 7 * 24 * 3600 },
  },
});

/**
 * The **producer half only** — `registerQueue` plus `ReviewSyncQueue`, and deliberately nothing
 * that consumes. Both processes publish to this queue and so both import this module:
 *
 *  - the API, via `ReviewSyncQueueUIModule` (which layers Bull Board on top), so
 *    `ConnectionsService` can publish a backfill job after onboarding;
 *  - the worker, via `CronModule`, so `CronService.pollDueLocations` can fan out `review-poll`
 *    jobs — the first thing in this codebase that enqueues from the worker rather than from an
 *    HTTP handler.
 *
 * **This split is load-bearing, not tidiness.** `ReviewSyncProcessor` (the `@Processor`
 * `WorkerHost`) must stay in `ReviewSyncQueueModule`, which only the worker imports: NestJS's Bull
 * explorer turns any `@Processor` provider in a graph into a live BullMQ worker, so putting the
 * processor anywhere the API can reach makes the *API process* start consuming review-sync jobs —
 * running 20 pages of Google pagination and classification inside the HTTP process, at double the
 * intended concurrency. An earlier revision of the poller collapsed the producer and consumer into
 * one module for exactly the reason above (the worker needed the producer) and reintroduced that
 * bug; `EmailQueueModule`/`EmailQueueUIModule` keep the same separation for the same reason.
 */
@Module({
  imports: [reviewSyncQueueBullModule],
  providers: [ReviewSyncQueue],
  exports: [reviewSyncQueueBullModule, ReviewSyncQueue],
})
export class ReviewSyncQueueProducerModule {}
