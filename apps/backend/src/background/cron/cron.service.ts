import { AccountAnonymizationService } from '@auth/services/account-anonymization.service';
import { ErasureNoticeService } from '@auth/services/erasure-notice.service';
import { ICronJob } from '@bg/interfaces/job.interface';
import type { IPurgeSkippedBusiness } from '@bg/interfaces/job.interface';
import { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { EnvConfig } from '@config/env.config';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

import { TenantErasureCleanupService } from './tenant-erasure-cleanup.service';

/** `platform_activity_log.actor_email` for entries with no human admin behind them. */
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
    private readonly billingReconciliationService: BillingReconciliationService,
    private readonly tenantSubscriptionsDbService: TenantSubscriptionsDbService,
    private readonly tenantErasureCleanupService: TenantErasureCleanupService,
    private readonly configService: ConfigService<EnvConfig>,
    private readonly erasureNoticeService: ErasureNoticeService
  ) {}

  sendDailyMail(data?: ICronJob): void {
    this.logger.debug('Sending Daily mail', data);
  }

  /** Nothing reads consumed OTPs or revoked/expired refresh tokens again, so the tables would grow forever. */
  async purgeStaleAuthTokens(): Promise<void> {
    const purged = await this.authDbService.purgeStaleTokens();
    this.logger.log(
      `Purged ${purged.otpTokens} stale OTP token(s) and ${purged.refreshTokens} stale refresh token(s)`
    );
  }

  /**
   * Enqueues one `review-poll` job per due location; does no fetching itself.
   *
   * `acquireSyncRun` is deliberately not called here: it would be a DB write per location per
   * tick, and a still-running poll would fail on the unique index. `runPoll` calls it when the job
   * starts, so a location already mid-poll loses that race silently.
   */
  async pollDueLocations(): Promise<void> {
    const locations = await this.connectionsDbService.findLocationsDueForPoll();

    let enqueued = 0;
    const failed: string[] = [];

    for (const location of locations) {
      // Isolated per location: the cron queue is `attempts: 1, removeOnFail: true`, so one throw
      // would drop every later location's poll for the cycle with no retry.
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

  /** Only tenants with an explicit `review_data_retention_months` are touched. */
  async purgeExpiredReviewerPii(): Promise<void> {
    const purged = await this.reviewSyncDbService.purgeExpiredReviewerPii();
    this.logger.log(`Anonymized ${purged} review(s) past their tenant's retention window`);
  }

  /**
   * The removal/erasure requests only revoke access and start the clock; this anonymizes once
   * `ERASURE_GRACE_PERIOD_DAYS` has elapsed.
   *
   * Runs under a session-level advisory lock so a concurrent run (another replica, a manual
   * trigger) can't double-process; anonymizing must never race itself across transactions.
   *
   * Tenant erasures go first and anonymize every user before the tenant flips to `erased`, so an
   * `erased` tenant never has a user holding PII. Standalone member removals run second.
   */
  async purgeErasureRequests(): Promise<void> {
    const gracePeriodDays = getErasureGracePeriodDays(this.configService);

    // First, so a tenant whose reminder window opens tonight is told before anything else runs;
    // it swallows its own errors so it can't block the purge.
    const reminded = await this.erasureNoticeService.sendDueReminders();
    if (reminded > 0) {
      this.logger.log(`Sent the erasure reminder for ${reminded} business(es)`);
    }

    await this.authDbService.runWithErasurePurgeLock(async acquireLock => {
      const dueTenants = await this.authDbService.findTenantsDueForErasurePurge(gracePeriodDays);
      let anonymizedUsers = 0;
      let erasedTenants = 0;
      const skippedTenants: string[] = [];
      const skippedDetails: IPurgeSkippedBusiness[] = [];

      for (const tenant of dueTenants) {
        await acquireLock('gdpr:tenant-erasure', tenant.id, async () => {
          const stillDue = await this.authDbService.isTenantStillDueForErasure(
            tenant.id,
            gracePeriodDays
          );
          if (!stillDue) {
            return;
          }

          // Release external resources first: anonymizing first would leave an "erased" business
          // still billed or connected with nobody able to sign in to stop either.
          try {
            await this.tenantErasureCleanupService.releaseExternalResources(tenant.id);
          } catch (error) {
            skippedTenants.push(tenant.id);
            skippedDetails.push({
              name: tenant.name,
              daysOverdue: this.daysOverdue(tenant.erasureRequestedAt, gracePeriodDays),
              reason: this.briefReason(error),
            });
            this.logger.error(
              `Skipping erasure of tenant ${tenant.id}: could not release its external resources (${
                (error as Error).message
              }); will retry at the next purge`
            );
            return;
          }

          // Read now: once the users are anonymized there is no address left to confirm to.
          const noticeRecipients = await this.erasureNoticeService.findRecipients(tenant.id);

          // One tenant failing (a Cloudinary avatar delete, a transaction) must not abort the rest
          // or the skipped-tenant alert below; anonymizing is idempotent per user.
          let erased: { name: string } | null;
          try {
            const userIds = await this.authDbService.findNonAnonymizedUserIdsForTenant(tenant.id);
            for (const userId of userIds) {
              await this.accountAnonymizationService.anonymizeUser(userId);
              anonymizedUsers += 1;
            }
            erased = await this.authDbService.markTenantErased(tenant.id);
          } catch (error) {
            skippedTenants.push(tenant.id);
            skippedDetails.push({
              name: tenant.name,
              daysOverdue: this.daysOverdue(tenant.erasureRequestedAt, gracePeriodDays),
              reason: this.briefReason(error),
            });
            this.logger.error(
              `Skipping erasure of tenant ${tenant.id}: anonymizing it failed (${
                (error as Error).message
              }); will retry at the next purge`
            );
            return;
          }

          if (erased) {
            erasedTenants += 1;
            await this.adminOverviewDbService.recordActivityBestEffort({
              type: PlatformActivityType.BUSINESS_ERASED,
              actorPlatformAdminId: null,
              actorEmail: SYSTEM_ACTOR_EMAIL,
              tenantId: tenant.id,
              businessName: erased.name,
            });
            await this.erasureNoticeService.notifyErased({
              recipients: noticeRecipients,
              businessName: erased.name,
            });
          }
        });
      }

      // Lock then re-verify, as above: a user an owner just un-removed must not be anonymized from a stale read.
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

      if (skippedTenants.length > 0) {
        // One line a log alert can match: a repeatedly failing erasure is a compliance problem.
        this.logger.error(
          `Erasure purge skipped ${skippedTenants.length} tenant(s) that could not be released: ${skippedTenants.join(', ')}`
        );
        // The log line is for alerting; this one is for a person. It swallows its own errors.
        await this.erasureNoticeService.notifyPurgeSkipped(skippedDetails);
      }

      this.logger.log(
        `Erasure purge: anonymized ${anonymizedUsers} user(s), erased ${erasedTenants} tenant(s)`
      );
    });
  }

  /** Whole days past the deadline (`erasure_requested_at + grace`); never negative. */
  private daysOverdue(erasureRequestedAt: string | null, gracePeriodDays: number): number {
    if (!erasureRequestedAt) {
      return 0;
    }
    const deadline = new Date(erasureRequestedAt).getTime() + gracePeriodDays * 86_400_000;
    return Math.max(0, Math.floor((Date.now() - deadline) / 86_400_000));
  }

  /** One short line of why, for a platform admin's email — never a stack. */
  private briefReason(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Unknown error';
  }

  /**
   * Catches tenants who paid but never returned to the checkout success page, so the synchronous
   * reconcile never ran. Candidates have a Stripe customer but are still `free` and unverified for
   * over an hour. Isolated per tenant so one Stripe failure doesn't starve the rest.
   */
  async reconcileStaleBillingSubscriptions(): Promise<void> {
    const candidates = await this.tenantSubscriptionsDbService.findStaleFreeWithStripeCustomer();

    let reconciled = 0;
    const failed: string[] = [];

    for (const candidate of candidates) {
      try {
        await this.billingReconciliationService.reconcileTenantSubscription(candidate);
        reconciled += 1;
      } catch (error) {
        failed.push(candidate.tenantId);
        this.logger.error(
          `Failed to reconcile billing for tenant ${candidate.tenantId}: ${(error as Error).message}`
        );
      }
    }

    if (failed.length > 0) {
      this.logger.error(
        `Reconciled ${reconciled}/${candidates.length} stale billing subscription(s); ` +
          `${failed.length} failed and will be retried at the next sweep: ${failed.join(', ')}`
      );
      return;
    }

    this.logger.debug(`Reconciled ${reconciled} stale billing subscription(s)`);
  }
}
