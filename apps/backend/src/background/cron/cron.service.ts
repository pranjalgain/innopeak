import { AccountAnonymizationService } from '@auth/services/account-anonymization.service';
import { ICronJob } from '@bg/interfaces/job.interface';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { EnvConfig } from '@config/env.config';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

/** `platform_activity_log.actor_email` for the one entry this log ever writes with no human admin
 *  behind it — see `RecordActivityInput.actorPlatformAdminId`'s own comment. */
const SYSTEM_ACTOR_EMAIL = 'system@innopeak.internal';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly authDbService: AuthDbService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly reviewSyncQueue: ReviewSyncQueue,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly accountAnonymizationService: AccountAnonymizationService,
    private readonly adminOverviewDbService: AdminOverviewDbService,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  sendDailyMail(data?: ICronJob): void {
    this.logger.debug('Sending Daily mail', data);
  }

  /**
   * Nothing reads a consumed verify_email code or a revoked/expired refresh token ever again
   * (`consumeVerifyEmailToken` and `findActiveRefreshToken` both exclude them), so without this
   * both tables only ever grow — one refresh_tokens row per session ever started, forever.
   */
  async purgeStaleAuthTokens(): Promise<void> {
    const purged = await this.authDbService.purgeStaleTokens();
    this.logger.log(
      `Purged ${purged.otpTokens} stale OTP token(s) and ${purged.refreshTokens} stale refresh token(s)`
    );
  }

  /**
   * The 15-minute poller's fan-out. Enumerates every location PLAN.md §8.2 makes eligible
   * (`ConnectionsRepository.findLocationsDueForPoll`) and publishes one `review-poll` job per
   * location — this method itself does no fetching, matching this codebase's own rule for `@Cron`
   * methods: enqueue, don't work.
   *
   * `acquireSyncRun` (the same CAS-and-reclaim `ReviewSyncRepository` method backfill uses) is
   * deliberately *not* called here — that would make this fan-out a database write per location on
   * every tick, and a location whose previous poll is still genuinely running would fail loudly on
   * the unique index instead of just not being re-enqueued. `runPoll` itself calls it once the job
   * actually starts (`IReviewSyncJob` carries no `syncRunId` for this reason — there is nothing to
   * carry yet at enqueue time), so a location already mid-poll simply loses that race silently
   * when its own job runs — no different from how a slow backfill already behaves against a
   * second trigger.
   */
  async pollDueLocations(): Promise<void> {
    const locations = await this.connectionsDbService.findLocationsDueForPoll();

    let enqueued = 0;
    const failed: string[] = [];

    for (const location of locations) {
      // Isolated per location on purpose. The cron queue runs `attempts: 1, removeOnFail: true`
      // (cron-ui.module.ts), so letting one bad `queue.add` throw out of this loop would drop
      // every *later* location's poll for the cycle with no retry — a transient Redis blip on
      // location 7 of 300 silently starving 293 tenants.
      try {
        await this.reviewSyncQueue.addPollJob({
          tenantId: location.tenantId,
          locationId: location.locationId,
          connectionId: location.connectionId,
          externalAccountId: location.externalAccountId,
          externalLocationId: location.externalLocationId,
        });
        enqueued += 1;
      } catch (error) {
        failed.push(location.locationId);
        this.logger.error(
          `Failed to enqueue review poll for location ${location.locationId}: ${(error as Error).message}`
        );
      }
    }

    if (failed.length > 0) {
      this.logger.error(
        `Enqueued ${enqueued}/${locations.length} review-poll job(s); ${failed.length} failed and will be retried at the next tick: ${failed.join(', ')}`
      );
      return;
    }

    this.logger.debug(`Enqueued ${enqueued} review-poll job(s)`);
  }

  /**
   * `PLAN.md` §6's nightly reviewer-retention purge. Only tenants with an explicit
   * `review_data_retention_months` set are touched — see
   * `ReviewSyncRepository.purgeExpiredReviewerPii` for the full query and its idempotency/locking
   * guarantees. The stale-`sync_runs` sweep (§8.1, cosmetic — see the ingestion doc) is a
   * separate, still-unbuilt follow-up to this same job, not part of it yet.
   */
  async purgeExpiredReviewerPii(): Promise<void> {
    const purged = await this.reviewSyncDbService.purgeExpiredReviewerPii();
    this.logger.log(`Anonymized ${purged} review(s) past their tenant's retention window`);
  }

  /**
   * The GDPR erasure grace-period sweep — both `TenantMembersService.requestRemoval` and
   * `AdminBusinessesService.requestErasure` only ever revoke access and start the clock; this job
   * is what actually anonymizes data once `ERASURE_GRACE_PERIOD_DAYS` has elapsed.
   *
   * Held under `AuthRepository.runWithErasurePurgeLock`'s session-level advisory lock for its
   * entire duration — a second concurrent run (another replica, an overlapping manual trigger)
   * would otherwise double-process the same tenants/users, since anonymizing a user is the one
   * step that must never race itself across two independent transactions.
   *
   * Tenant-wide erasures go first, and fully (every user in the tenant) before the tenant itself
   * flips to `erased` — so a tenant is never observed as `erased` while any of its users still
   * holds PII. Reviews, replies, locations, connections, and billing records are never touched
   * here; there is nothing for this job to do to them once every user is anonymized.
   *
   * Standalone member removals run second, in the same tick — see
   * `AuthRepository.findUsersDueForErasurePurge`'s own comment for why that query needs no
   * explicit exclusion for users already handled by the tenant loop above.
   */
  async purgeErasureRequests(): Promise<void> {
    const gracePeriodDays = getErasureGracePeriodDays(this.configService);

    await this.authDbService.runWithErasurePurgeLock(async acquireLock => {
      const dueTenants = await this.authDbService.findTenantsDueForErasurePurge(gracePeriodDays);
      let anonymizedUsers = 0;
      let erasedTenants = 0;

      for (const tenant of dueTenants) {
        await acquireLock('gdpr:tenant-erasure', tenant.id, async () => {
          const stillDue = await this.authDbService.isTenantStillDueForErasure(
            tenant.id,
            gracePeriodDays
          );
          if (!stillDue) {
            return;
          }

          const userIds = await this.authDbService.findNonAnonymizedUserIdsForTenant(tenant.id);
          for (const userId of userIds) {
            await this.accountAnonymizationService.anonymizeUser(userId);
            anonymizedUsers += 1;
          }

          const erased = await this.authDbService.markTenantErased(tenant.id);
          if (erased) {
            erasedTenants += 1;
            await this.adminOverviewDbService.recordActivityBestEffort({
              type: PlatformActivityType.BUSINESS_ERASED,
              actorPlatformAdminId: null,
              actorEmail: SYSTEM_ACTOR_EMAIL,
              tenantId: tenant.id,
              businessName: erased.name,
            });
          }
        });
      }

      // Same per-resource-lock-then-re-verify shape as the tenant loop above, closing the
      // identical TOCTOU race against a concurrent `AuthRepository.cancelMemberRemoval` call for
      // one of these same user ids — without it, a user an owner just un-removed could still be
      // anonymized from this loop's stale read.
      const standaloneUserIds =
        await this.authDbService.findUsersDueForErasurePurge(gracePeriodDays);
      for (const userId of standaloneUserIds) {
        await acquireLock('gdpr:member-erasure', userId, async () => {
          const stillDue = await this.authDbService.isUserStillDueForErasure(
            userId,
            gracePeriodDays
          );
          if (!stillDue) {
            return;
          }

          await this.accountAnonymizationService.anonymizeUser(userId);
          anonymizedUsers += 1;
        });
      }

      this.logger.log(
        `Erasure purge: anonymized ${anonymizedUsers} user(s), erased ${erasedTenants} tenant(s)`
      );
    });
  }
}
