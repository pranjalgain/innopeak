import { AccountAnonymizationService } from '@auth/services/account-anonymization.service';
import { ErasureNoticeService } from '@auth/services/erasure-notice.service';
import { CronJobName } from '@bg/constants/job.constant';
import type { ICronJob } from '@bg/interfaces/job.interface';
import { BillingReconciliationService } from '@billing/services/billing-reconciliation.service';
import { AdminOverviewDbService } from '@db/repositories/admin-overview/admin-overview.db-service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { AcquireErasureLock } from '@db/repositories/auth/types/auth.type';
import { StripeWebhookEventsDbService } from '@db/repositories/billing/stripe-webhook-events.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { NotificationsDbService } from '@db/repositories/notifications/notifications.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ReviewSyncQueue } from '@review-sync-queue/review-sync.queue';

import { CronService } from './cron.service';
import { TenantErasureCleanupService } from './tenant-erasure-cleanup.service';

describe('CronService', () => {
  let target: CronService;
  let authDbService: jest.Mocked<AuthDbService>;
  let connectionsDbService: jest.Mocked<ConnectionsDbService>;
  let reviewSyncQueue: jest.Mocked<ReviewSyncQueue>;
  let reviewSyncDbService: jest.Mocked<ReviewSyncDbService>;
  let accountAnonymizationService: jest.Mocked<AccountAnonymizationService>;
  let notificationsDbService: { purgeOld: jest.Mock };
  let adminOverviewDbService: jest.Mocked<AdminOverviewDbService>;
  let billingReconciliationService: jest.Mocked<
    Pick<
      BillingReconciliationService,
      'reconcileTenantSubscription' | 'scheduleCancellationForErasure'
    >
  >;
  let stripeWebhookEventsDbService: { purgeProcessedBefore: jest.Mock };
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<
      TenantSubscriptionsDbService,
      'findPendingErasureWithBillableSubscription' | 'findStaleFreeWithStripeCustomer'
    >
  >;
  let erasureNoticeService: {
    sendDueReminders: jest.Mock;
    findRecipients: jest.Mock;
    notifyErased: jest.Mock;
    notifyPurgeSkipped: jest.Mock;
  };
  let tenantErasureCleanupService: { releaseExternalResources: jest.Mock };
  let configService: { get: jest.Mock };
  let acquireLock: jest.Mock;

  beforeEach(async () => {
    acquireLock = jest.fn(
      (_lockKey: string, _resourceId: string, innerFn: () => Promise<unknown>) => innerFn()
    );

    authDbService = {
      purgeStaleTokens: jest.fn(),
      runWithErasurePurgeLock: jest.fn(
        (fn: (acquireLock: AcquireErasureLock) => Promise<unknown>) =>
          fn(acquireLock as unknown as AcquireErasureLock)
      ),
      isTenantStillDueForErasure: jest.fn().mockResolvedValue(true),
      isUserStillDueForErasure: jest.fn().mockResolvedValue(true),
      findTenantsDueForErasurePurge: jest.fn().mockResolvedValue([]),
      findNonAnonymizedUserIdsForTenant: jest.fn().mockResolvedValue([]),
      markTenantErased: jest.fn(),
      findUsersDueForErasurePurge: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<AuthDbService>;

    connectionsDbService = {
      findLocationsDueForPoll: jest.fn(),
    } as unknown as jest.Mocked<ConnectionsDbService>;

    reviewSyncQueue = {
      addPollJob: jest.fn(),
    } as unknown as jest.Mocked<ReviewSyncQueue>;

    reviewSyncDbService = {
      purgeExpiredReviewerPii: jest.fn(),
    } as unknown as jest.Mocked<ReviewSyncDbService>;

    notificationsDbService = { purgeOld: jest.fn().mockResolvedValue(0) };

    accountAnonymizationService = {
      anonymizeUser: jest.fn().mockResolvedValue(undefined),
      deleteAvatar: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AccountAnonymizationService>;

    adminOverviewDbService = {
      recordActivityBestEffort: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AdminOverviewDbService>;

    billingReconciliationService = {
      reconcileTenantSubscription: jest.fn().mockResolvedValue(undefined),
      scheduleCancellationForErasure: jest.fn().mockResolvedValue(undefined),
    };

    stripeWebhookEventsDbService = { purgeProcessedBefore: jest.fn().mockResolvedValue(0) };

    tenantSubscriptionsDbService = {
      findStaleFreeWithStripeCustomer: jest.fn().mockResolvedValue([]),
      findPendingErasureWithBillableSubscription: jest.fn().mockResolvedValue([]),
    };

    tenantErasureCleanupService = {
      releaseExternalResources: jest.fn().mockResolvedValue(undefined),
    };

    erasureNoticeService = {
      sendDueReminders: jest.fn().mockResolvedValue(0),
      findRecipients: jest.fn().mockResolvedValue([]),
      notifyErased: jest.fn().mockResolvedValue(undefined),
      notifyPurgeSkipped: jest.fn().mockResolvedValue(undefined),
    };

    configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CronService,
        { provide: AuthDbService, useValue: authDbService },
        { provide: ConnectionsDbService, useValue: connectionsDbService },
        { provide: ReviewSyncQueue, useValue: reviewSyncQueue },
        { provide: ReviewSyncDbService, useValue: reviewSyncDbService },
        { provide: AccountAnonymizationService, useValue: accountAnonymizationService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
        { provide: BillingReconciliationService, useValue: billingReconciliationService },
        { provide: TenantSubscriptionsDbService, useValue: tenantSubscriptionsDbService },
        { provide: StripeWebhookEventsDbService, useValue: stripeWebhookEventsDbService },
        { provide: TenantErasureCleanupService, useValue: tenantErasureCleanupService },
        { provide: ErasureNoticeService, useValue: erasureNoticeService },
        { provide: NotificationsDbService, useValue: notificationsDbService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    target = module.get(CronService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendDailyMail', () => {
    it('logs the daily mail job when data is provided', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const data: ICronJob = { jobType: CronJobName.DAILY_MAIL, data: { foo: 'bar' } };

      expect(() => {
        target.sendDailyMail(data);
      }).not.toThrow();
      expect(debugSpy).toHaveBeenCalledWith('Sending Daily mail', data);
    });

    it('logs the daily mail job when called without data', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      expect(() => {
        target.sendDailyMail();
      }).not.toThrow();
      expect(debugSpy).toHaveBeenCalledWith('Sending Daily mail', undefined);
    });

    it('returns undefined (void, synchronous)', () => {
      jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- asserting the void return is genuinely `undefined` at runtime is the point of this test
      const result = target.sendDailyMail();

      expect(result).toBeUndefined();
    });
  });

  describe('purgeStaleAuthTokens', () => {
    it('delegates to AuthDbService.purgeStaleTokens and logs the counts', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      authDbService.purgeStaleTokens.mockResolvedValue({
        otpTokens: 3,
        refreshTokens: 12,
        pendingSignups: 2,
      });

      await target.purgeStaleAuthTokens();

      expect(authDbService.purgeStaleTokens).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3 stale OTP'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('12 stale refresh'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2 unverified sign-up'));
    });

    it('propagates a DB failure so the job is retried / lands in the DLQ', async () => {
      authDbService.purgeStaleTokens.mockRejectedValue(new Error('db down'));

      await expect(target.purgeStaleAuthTokens()).rejects.toThrow('db down');
    });
  });

  describe('purgeOldNotifications', () => {
    it('purges with the configured retention and logs the count', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      notificationsDbService.purgeOld.mockResolvedValue(42);

      await target.purgeOldNotifications();

      expect(notificationsDbService.purgeOld).toHaveBeenCalledWith({
        readRetentionDays: 90,
        unreadRetentionDays: 180,
      });
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('42 old in-app'));
    });

    it('propagates a DB failure so the job is retried / lands in the DLQ', async () => {
      notificationsDbService.purgeOld.mockRejectedValue(new Error('db down'));

      await expect(target.purgeOldNotifications()).rejects.toThrow('db down');
    });
  });

  describe('pollDueLocations', () => {
    it('enqueues one poll job per eligible location, with no syncRunId in the payload', async () => {
      connectionsDbService.findLocationsDueForPoll.mockResolvedValue([
        {
          tenantId: 'tenant-1',
          locationId: 'location-1',
          connectionId: 'connection-1',
          externalAccountId: 'accounts/1',
          externalLocationId: 'locations/1',
        },
        {
          tenantId: 'tenant-2',
          locationId: 'location-2',
          connectionId: 'connection-2',
          externalAccountId: 'accounts/2',
          externalLocationId: 'locations/2',
        },
      ]);

      await target.pollDueLocations();

      expect(reviewSyncQueue.addPollJob).toHaveBeenCalledTimes(2);
      expect(reviewSyncQueue.addPollJob).toHaveBeenNthCalledWith(1, {
        tenantId: 'tenant-1',
        locationId: 'location-1',
        connectionId: 'connection-1',
        externalAccountId: 'accounts/1',
        externalLocationId: 'locations/1',
      });
    });

    it('enqueues nothing when no location is due', async () => {
      connectionsDbService.findLocationsDueForPoll.mockResolvedValue([]);

      await target.pollDueLocations();

      expect(reviewSyncQueue.addPollJob).not.toHaveBeenCalled();
    });

    // The cron queue is `attempts: 1`, so a throw escaping the loop would drop every later location's poll.
    it('keeps enqueueing the remaining locations when one enqueue fails', async () => {
      connectionsDbService.findLocationsDueForPoll.mockResolvedValue([
        {
          tenantId: 't1',
          locationId: 'loc-1',
          connectionId: 'c1',
          externalAccountId: 'a1',
          externalLocationId: 'l1',
        },
        {
          tenantId: 't2',
          locationId: 'loc-2',
          connectionId: 'c2',
          externalAccountId: 'a2',
          externalLocationId: 'l2',
        },
        {
          tenantId: 't3',
          locationId: 'loc-3',
          connectionId: 'c3',
          externalAccountId: 'a3',
          externalLocationId: 'l3',
        },
      ]);
      reviewSyncQueue.addPollJob
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('redis unavailable'))
        .mockResolvedValueOnce(undefined);

      await expect(target.pollDueLocations()).resolves.toBeUndefined();

      expect(reviewSyncQueue.addPollJob).toHaveBeenCalledTimes(3);
    });
  });

  describe('purgeExpiredReviewerPii', () => {
    it('delegates to ReviewSyncDbService.purgeExpiredReviewerPii and logs the count', async () => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
      reviewSyncDbService.purgeExpiredReviewerPii.mockResolvedValue(7);

      await target.purgeExpiredReviewerPii();

      expect(reviewSyncDbService.purgeExpiredReviewerPii).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Anonymized 7 review'));
    });

    it('propagates a DB failure so the job is retried / lands in the DLQ', async () => {
      reviewSyncDbService.purgeExpiredReviewerPii.mockRejectedValue(new Error('db down'));

      await expect(target.purgeExpiredReviewerPii()).rejects.toThrow('db down');
    });
  });

  describe('purgeErasureRequests', () => {
    it('runs the whole sweep under the session-level erasure-purge lock', async () => {
      await target.purgeErasureRequests();

      expect(authDbService.runWithErasurePurgeLock).toHaveBeenCalledTimes(1);
    });

    it('anonymizes every non-anonymized user in a due tenant before flipping it to erased', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue(['user-1', 'user-2']);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });

      await target.purgeErasureRequests();

      expect(authDbService.findNonAnonymizedUserIdsForTenant).toHaveBeenCalledWith('tenant-1');
      expect(accountAnonymizationService.anonymizeUser).toHaveBeenCalledWith('user-1');
      expect(accountAnonymizationService.anonymizeUser).toHaveBeenCalledWith('user-2');
      expect(authDbService.markTenantErased).toHaveBeenCalledWith('tenant-1');
    });

    it("releases the tenant's external resources before anonymizing anyone", async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue(['user-1']);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });

      await target.purgeErasureRequests();

      expect(tenantErasureCleanupService.releaseExternalResources).toHaveBeenCalledWith('tenant-1');
      expect(
        tenantErasureCleanupService.releaseExternalResources.mock.invocationCallOrder[0]
      ).toBeLessThan(accountAnonymizationService.anonymizeUser.mock.invocationCallOrder[0] ?? 0);
    });

    // Erasing before a failed release would leave a tenant still billed or connected that nobody can sign in to.
    it('leaves the tenant alone, to be retried, when its resources cannot be released', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue(['user-1']);
      tenantErasureCleanupService.releaseExternalResources.mockRejectedValue(
        new Error('stripe unreachable')
      );

      await target.purgeErasureRequests();

      expect(accountAnonymizationService.anonymizeUser).not.toHaveBeenCalled();
      expect(authDbService.markTenantErased).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('skipped 1 tenant(s)'));
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('tenant-1'));
    });

    it('reads the owners to confirm to before anonymizing them, and mails them once the tenant is erased', async () => {
      const owners = [{ email: 'o@example.com', name: 'Owen', locale: 'de' }];
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue(['user-1']);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });
      erasureNoticeService.findRecipients.mockResolvedValue(owners);

      await target.purgeErasureRequests();

      expect(erasureNoticeService.notifyErased).toHaveBeenCalledWith({
        recipients: owners,
        businessName: 'The Coastal Table',
      });
      expect(erasureNoticeService.findRecipients.mock.invocationCallOrder[0]).toBeLessThan(
        accountAnonymizationService.anonymizeUser.mock.invocationCallOrder[0] ?? 0
      );
    });

    it('sends no confirmation for a tenant that was skipped', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      tenantErasureCleanupService.releaseExternalResources.mockRejectedValue(new Error('down'));

      await target.purgeErasureRequests();

      expect(erasureNoticeService.notifyErased).not.toHaveBeenCalled();
    });

    it('sends the reminders before purging', async () => {
      await target.purgeErasureRequests();

      expect(erasureNoticeService.sendDueReminders).toHaveBeenCalledTimes(1);
      expect(erasureNoticeService.sendDueReminders.mock.invocationCallOrder[0]).toBeLessThan(
        authDbService.runWithErasurePurgeLock.mock.invocationCallOrder[0] ?? 0
      );
    });

    it('alerts the platform admins about a skipped tenant, with how overdue it is and why', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const longAgo = new Date(Date.now() - 25 * 86_400_000).toISOString(); // grace 21 → 4 days over
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: longAgo },
      ]);
      tenantErasureCleanupService.releaseExternalResources.mockRejectedValue(
        new Error('stripe unreachable\n  at somewhere')
      );

      await target.purgeErasureRequests();

      expect(erasureNoticeService.notifyPurgeSkipped).toHaveBeenCalledWith([
        {
          name: 'The Coastal Table',
          daysOverdue: 4,
          reason: 'stripe unreachable at somewhere',
        },
      ]);
    });

    it('carries on with later tenants, and still sends the alert, when one tenant fails to anonymize', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation();
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'Broken Co', erasureRequestedAt: null },
        { id: 'tenant-2', name: 'Fine Co', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant
        .mockResolvedValueOnce(['user-1'])
        .mockResolvedValueOnce([]);
      accountAnonymizationService.deleteAvatar.mockRejectedValueOnce(new Error('cloudinary down'));
      authDbService.markTenantErased.mockResolvedValue({ name: 'Fine Co' });

      await expect(target.purgeErasureRequests()).resolves.toBeUndefined();

      expect(authDbService.markTenantErased).toHaveBeenCalledTimes(1);
      expect(authDbService.markTenantErased).toHaveBeenCalledWith('tenant-2');
      expect(erasureNoticeService.notifyPurgeSkipped).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Broken Co', reason: 'cloudinary down' }),
      ]);
    });

    // The "erased" notice reads its recipients before anonymizing and cannot rebuild them afterwards, so a photo that
    // fails must not leave half the business anonymized.
    it('deletes every photo before anonymizing anyone, so a failed delete leaves the business untouched', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'Broken Co', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue(['user-1', 'user-2']);
      accountAnonymizationService.deleteAvatar
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('cloudinary down'));

      await target.purgeErasureRequests();

      expect(accountAnonymizationService.anonymizeUser).not.toHaveBeenCalled();
      expect(authDbService.markTenantErased).not.toHaveBeenCalled();
      expect(erasureNoticeService.notifyErased).not.toHaveBeenCalled();
    });

    it('sends no alert when nothing was skipped', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue([]);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });

      await target.purgeErasureRequests();

      expect(erasureNoticeService.notifyPurgeSkipped).not.toHaveBeenCalled();
    });

    it('logs BUSINESS_ERASED with no human admin actor once a tenant is fully erased', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue([]);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });

      await target.purgeErasureRequests();

      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({
          actorPlatformAdminId: null,
          tenantId: 'tenant-1',
          // The entry says an erasure happened, not whose: the name is already gone from the rest of the data.
          businessName: '[erased]',
        })
      );
    });

    it('still tells the former members which business was erased', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue([]);
      authDbService.markTenantErased.mockResolvedValue({ name: 'The Coastal Table' });

      await target.purgeErasureRequests();

      expect(erasureNoticeService.notifyErased).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: 'The Coastal Table' })
      );
    });

    it('does not log an activity when the tenant was not actually flipped (already erased)', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.findNonAnonymizedUserIdsForTenant.mockResolvedValue([]);
      authDbService.markTenantErased.mockResolvedValue(null);

      await target.purgeErasureRequests();

      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    // The due-tenants read can be stale by lock time (a concurrent `cancelErasure`); re-verifying under the lock keeps an un-erased tenant safe.
    it('takes the per-tenant lock and skips a tenant that is no longer due once re-verified', async () => {
      authDbService.findTenantsDueForErasurePurge.mockResolvedValue([
        { id: 'tenant-1', name: 'The Coastal Table', erasureRequestedAt: null },
      ]);
      authDbService.isTenantStillDueForErasure.mockResolvedValue(false);

      await target.purgeErasureRequests();

      expect(acquireLock).toHaveBeenCalledWith(
        'gdpr:tenant-erasure',
        'tenant-1',
        expect.any(Function)
      );
      expect(authDbService.isTenantStillDueForErasure).toHaveBeenCalledWith('tenant-1', 21);
      expect(authDbService.findNonAnonymizedUserIdsForTenant).not.toHaveBeenCalled();
      expect(authDbService.markTenantErased).not.toHaveBeenCalled();
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });

    // Same lock + re-verify as the tenant loop, against a concurrent `cancelMemberRemoval`.
    it('takes the per-member lock and skips a standalone user that is no longer due once re-verified', async () => {
      authDbService.findUsersDueForErasurePurge.mockResolvedValue(['user-3']);
      authDbService.isUserStillDueForErasure.mockResolvedValue(false);

      await target.purgeErasureRequests();

      expect(acquireLock).toHaveBeenCalledWith(
        'gdpr:member-erasure',
        'user-3',
        expect.any(Function)
      );
      expect(authDbService.isUserStillDueForErasure).toHaveBeenCalledWith('user-3', 21);
      expect(accountAnonymizationService.anonymizeUser).not.toHaveBeenCalled();
    });

    // One failing photo used to throw out of the loop: the rest of the members were never reached and no alert was sent.
    it('keeps going after one standalone member fails, and alerts about it', async () => {
      authDbService.findUsersDueForErasurePurge.mockResolvedValue(['user-3', 'user-4']);
      accountAnonymizationService.anonymizeUser.mockRejectedValueOnce(new Error('cloudinary down'));

      await expect(target.purgeErasureRequests()).resolves.toBeUndefined();

      expect(accountAnonymizationService.anonymizeUser).toHaveBeenCalledWith('user-4');
      expect(erasureNoticeService.notifyPurgeSkipped).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'team member user-3', reason: 'cloudinary down' }),
      ]);
    });

    it('anonymizes standalone due member removals independent of any tenant erasure', async () => {
      authDbService.findUsersDueForErasurePurge.mockResolvedValue(['user-3']);

      await target.purgeErasureRequests();

      expect(accountAnonymizationService.anonymizeUser).toHaveBeenCalledWith('user-3');
    });

    it('reads the configured grace period rather than a hardcoded default when set', async () => {
      configService.get.mockReturnValue(30);

      await target.purgeErasureRequests();

      expect(authDbService.findTenantsDueForErasurePurge).toHaveBeenCalledWith(30);
      expect(authDbService.findUsersDueForErasurePurge).toHaveBeenCalledWith(30);
    });

    it('defaults the grace period to 21 days when unset', async () => {
      await target.purgeErasureRequests();

      expect(authDbService.findTenantsDueForErasurePurge).toHaveBeenCalledWith(21);
    });
  });

  describe('reconcileStaleBillingSubscriptions', () => {
    it('reconciles every stale candidate against Stripe', async () => {
      tenantSubscriptionsDbService.findStaleFreeWithStripeCustomer.mockResolvedValue([
        { tenantId: 'tenant-1', stripeCustomerId: 'cus_1' },
        { tenantId: 'tenant-2', stripeCustomerId: 'cus_2' },
      ]);

      await target.reconcileStaleBillingSubscriptions();

      expect(billingReconciliationService.reconcileTenantSubscription).toHaveBeenCalledTimes(2);
      expect(billingReconciliationService.reconcileTenantSubscription).toHaveBeenNthCalledWith(1, {
        tenantId: 'tenant-1',
        stripeCustomerId: 'cus_1',
      });
      expect(billingReconciliationService.reconcileTenantSubscription).toHaveBeenNthCalledWith(2, {
        tenantId: 'tenant-2',
        stripeCustomerId: 'cus_2',
      });
    });

    it('does nothing when there are no stale candidates', async () => {
      tenantSubscriptionsDbService.findStaleFreeWithStripeCustomer.mockResolvedValue([]);

      await target.reconcileStaleBillingSubscriptions();

      expect(billingReconciliationService.reconcileTenantSubscription).not.toHaveBeenCalled();
    });

    // The request-time cancellation only logs a failure; a business waiting out a 21-day grace period would keep being charged.
    describe('retrying the cancellation for businesses pending erasure', () => {
      it('asks again for each business still billing, even when nothing else is stale', async () => {
        tenantSubscriptionsDbService.findPendingErasureWithBillableSubscription.mockResolvedValue([
          'tenant-1',
          'tenant-2',
        ]);

        await target.reconcileStaleBillingSubscriptions();

        expect(billingReconciliationService.scheduleCancellationForErasure).toHaveBeenCalledTimes(
          2
        );
        expect(billingReconciliationService.scheduleCancellationForErasure).toHaveBeenCalledWith(
          'tenant-1'
        );
        expect(billingReconciliationService.scheduleCancellationForErasure).toHaveBeenCalledWith(
          'tenant-2'
        );
      });

      it('keeps going past one that fails, and still runs when the stale reconcile failed', async () => {
        tenantSubscriptionsDbService.findStaleFreeWithStripeCustomer.mockResolvedValue([
          { tenantId: 'tenant-9', stripeCustomerId: 'cus_9' },
        ]);
        billingReconciliationService.reconcileTenantSubscription.mockRejectedValue(
          new Error('Stripe timeout')
        );
        tenantSubscriptionsDbService.findPendingErasureWithBillableSubscription.mockResolvedValue([
          'tenant-1',
          'tenant-2',
        ]);
        billingReconciliationService.scheduleCancellationForErasure.mockRejectedValueOnce(
          new Error('Stripe down')
        );

        await expect(target.reconcileStaleBillingSubscriptions()).resolves.toBeUndefined();

        expect(billingReconciliationService.scheduleCancellationForErasure).toHaveBeenCalledTimes(
          2
        );
      });
    });

    // The ledger only has to outlast Stripe's three days of redelivery; it grew with every event, forever.
    describe('the webhook ledger', () => {
      it('purges rows older than 90 days as part of the nightly sweep', async () => {
        stripeWebhookEventsDbService.purgeProcessedBefore.mockResolvedValue(4);
        const before = Date.now();

        await target.reconcileStaleBillingSubscriptions();

        const [cutoff] = stripeWebhookEventsDbService.purgeProcessedBefore.mock.calls[0] as [Date];
        expect(Math.round((before - cutoff.getTime()) / 86_400_000)).toBe(90);
      });

      it('never fails the sweep when the purge itself fails', async () => {
        stripeWebhookEventsDbService.purgeProcessedBefore.mockRejectedValue(new Error('db down'));

        await expect(target.reconcileStaleBillingSubscriptions()).resolves.toBeUndefined();
      });
    });

    // Regression: the erasure query failing skipped the ledger purge, and the candidate query failing skipped both.
    describe('when one step fails', () => {
      it('still retries the erasure cancellations and purges the ledger, then reports the failure', async () => {
        tenantSubscriptionsDbService.findStaleFreeWithStripeCustomer.mockRejectedValue(
          new Error('db down')
        );
        tenantSubscriptionsDbService.findPendingErasureWithBillableSubscription.mockResolvedValue([
          'tenant-1',
        ]);

        await expect(target.reconcileStaleBillingSubscriptions()).rejects.toThrow('db down');

        expect(billingReconciliationService.scheduleCancellationForErasure).toHaveBeenCalledWith(
          'tenant-1'
        );
        expect(stripeWebhookEventsDbService.purgeProcessedBefore).toHaveBeenCalledTimes(1);
      });

      it('still purges the ledger when the pending-erasure query fails', async () => {
        tenantSubscriptionsDbService.findPendingErasureWithBillableSubscription.mockRejectedValue(
          new Error('db down')
        );

        await expect(target.reconcileStaleBillingSubscriptions()).rejects.toThrow('db down');

        expect(stripeWebhookEventsDbService.purgeProcessedBefore).toHaveBeenCalledTimes(1);
      });
    });

    // One tenant's Stripe lookup failing must not starve the other candidates.
    it('keeps reconciling the remaining candidates when one fails', async () => {
      tenantSubscriptionsDbService.findStaleFreeWithStripeCustomer.mockResolvedValue([
        { tenantId: 'tenant-1', stripeCustomerId: 'cus_1' },
        { tenantId: 'tenant-2', stripeCustomerId: 'cus_2' },
        { tenantId: 'tenant-3', stripeCustomerId: 'cus_3' },
      ]);
      billingReconciliationService.reconcileTenantSubscription
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Stripe timeout'))
        .mockResolvedValueOnce(undefined);

      await expect(target.reconcileStaleBillingSubscriptions()).resolves.toBeUndefined();

      expect(billingReconciliationService.reconcileTenantSubscription).toHaveBeenCalledTimes(3);
    });
  });
});
