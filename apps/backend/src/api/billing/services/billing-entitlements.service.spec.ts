import type { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import type { EnvConfig } from '@config/env.config';
import type { DrizzleTransaction } from '@db/db.service';
import type { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import type { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { LocationRow } from '@db/repositories/connections/types/connections.type';
import type { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { ConfigService } from '@nestjs/config';

const fakeTx = { __fakeTx: true } as unknown as DrizzleTransaction;

import { BillingEntitlementsService } from './billing-entitlements.service';

import {
  LocationNotEligibleForActivationException,
  PlanNotFoundException,
  SubscriptionNotFoundException,
} from '../exceptions/billing.exceptions';

const baseLocation = (overrides: Partial<LocationRow>): LocationRow => ({
  id: 'location-1',
  tenantId: 'tenant-1',
  providerConnectionId: 'connection-1',
  provider: 'google' as LocationRow['provider'],
  externalLocationId: 'locations/1',
  name: 'The Coffee House',
  address: null,
  phone: null,
  websiteUri: null,
  category: null,
  googleRating: null,
  googleReviewCount: null,
  detailsRefreshedAt: null,
  reviewsReconciledAt: null,
  status: LocationStatus.ACTIVE,
  lastSyncedAt: null,
  lastSyncStatus: null,
  lastSyncError: null,
  onboardingBackfillCompletedAt: null,
  lastReviewSyncedAt: null,
  billingPausedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('BillingEntitlementsService', () => {
  /** Plan limits only apply while payments are on, so most tests build with the flag on. */
  function build(paymentFeatureEnabled: string | undefined): BillingEntitlementsService {
    const config: Record<string, string | undefined> = {
      PAYMENT_FEATURE_ENABLED: paymentFeatureEnabled,
      FRONTEND_URL: 'https://app.example.com/',
    };
    const configService = {
      get: (key: string) => config[key],
    } as unknown as ConfigService<EnvConfig>;
    return new BillingEntitlementsService(
      tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
      billingPlansDbService as unknown as BillingPlansDbService,
      connectionsDbService as unknown as ConnectionsDbService,
      authDbService as unknown as AuthDbService,
      reviewSyncDbService as unknown as ReviewSyncDbService,
      queueManager as unknown as AddingJobsToQueueManager,
      configService
    );
  }

  let target: BillingEntitlementsService;
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<TenantSubscriptionsDbService, 'findByTenantId' | 'findFreeTenantIdsOverLocationCap'>
  >;
  let billingPlansDbService: jest.Mocked<Pick<BillingPlansDbService, 'findByCode' | 'findById'>>;
  let connectionsDbService: jest.Mocked<
    Pick<
      ConnectionsDbService,
      | 'applyBillingLocationSelection'
      | 'countActiveUnpausedLocations'
      | 'findLocationForTenant'
      | 'findLocationsByTenant'
      | 'withLocationSelectionLock'
    >
  >;
  let authDbService: jest.Mocked<
    Pick<
      AuthDbService,
      | 'findActiveLocationId'
      | 'findTenantOwnerRecipients'
      | 'findTenantStatus'
      | 'listTenantMembers'
    >
  >;
  let queueManager: { addLocationsPausedEmailJob: jest.Mock };
  let reviewSyncDbService: jest.Mocked<
    Pick<ReviewSyncDbService, 'countAiGeneratedResponsesThisMonth'>
  >;

  const freePlan = {
    id: 'plan-free',
    code: BillingPlanCode.FREE,
    stripeProductId: null,
    stripePriceId: null,
    maxLocations: 1,
    maxAiDraftsPerMonth: 20,
    maxTeamMembers: 1,
    customPromptsEnabled: false,
  };

  const paidPlan = {
    id: 'plan-paid',
    code: BillingPlanCode.PAID,
    stripeProductId: 'prod_1',
    stripePriceId: 'price_1',
    maxLocations: null,
    maxAiDraftsPerMonth: null,
    maxTeamMembers: null,
    customPromptsEnabled: true,
  };

  const subscription = {
    id: 'sub-row-1',
    tenantId: 'tenant-1',
    planId: 'plan-free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancellationSource: null,
    stripeLastVerifiedAt: null,
    checkoutStartedAt: null,
  };

  beforeEach(() => {
    tenantSubscriptionsDbService = {
      findByTenantId: jest.fn(),
      findFreeTenantIdsOverLocationCap: jest.fn(),
    };
    billingPlansDbService = { findByCode: jest.fn(), findById: jest.fn() };
    connectionsDbService = {
      countActiveUnpausedLocations: jest.fn(),
      findLocationsByTenant: jest.fn(),
      findLocationForTenant: jest.fn(),
      applyBillingLocationSelection: jest.fn(),
      withLocationSelectionLock: jest.fn(),
    };
    authDbService = {
      listTenantMembers: jest.fn(),
      findActiveLocationId: jest.fn(),
      findTenantOwnerRecipients: jest.fn().mockResolvedValue([]),
      findTenantStatus: jest.fn().mockResolvedValue({ name: 'Coastal Table' }),
    };
    queueManager = { addLocationsPausedEmailJob: jest.fn().mockResolvedValue(undefined) };
    reviewSyncDbService = { countAiGeneratedResponsesThisMonth: jest.fn() };

    target = build('true');

    tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(subscription);
    billingPlansDbService.findById.mockResolvedValue(freePlan);
    // enforceLocationLimitOnDowngrade reads the Free plan by code, not by id.
    billingPlansDbService.findByCode.mockResolvedValue(freePlan);
    connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(0);
    authDbService.listTenantMembers.mockResolvedValue([]);
    reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(0);
    // Fake lock: hands findLocationsByTenant's mock result and a fake tx to the callback.
    connectionsDbService.withLocationSelectionLock.mockImplementation(
      async (
        tenantId: string,
        fn: (tx: DrizzleTransaction, activeLocations: LocationRow[]) => unknown
      ) =>
        fn(
          fakeTx,
          await connectionsDbService.findLocationsByTenant(tenantId, LocationStatus.ACTIVE)
        )
    );
  });

  describe('getEntitlements', () => {
    it('throws SubscriptionNotFoundException when the tenant has no subscription row', async () => {
      tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(null);

      await expect(target.getEntitlements('tenant-1')).rejects.toBeInstanceOf(
        SubscriptionNotFoundException
      );
    });

    it('throws PlanNotFoundException when the subscription points at a plan that no longer resolves', async () => {
      billingPlansDbService.findById.mockResolvedValue(null);

      await expect(target.getEntitlements('tenant-1')).rejects.toBeInstanceOf(
        PlanNotFoundException
      );
    });

    it('composes plan columns with live usage counts', async () => {
      connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(1);
      authDbService.listTenantMembers.mockResolvedValue([{} as never]);
      reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(5);

      const result = await target.getEntitlements('tenant-1');

      expect(result).toEqual({
        planCode: BillingPlanCode.FREE,
        maxLocations: 1,
        maxAiDraftsPerMonth: 20,
        maxTeamMembers: 1,
        customPromptsEnabled: false,
        activeLocationCount: 1,
        teamMemberCount: 1,
        aiDraftsUsedThisMonth: 5,
      });
    });
  });

  describe('canAddLocation', () => {
    it('returns true when the plan has no location cap', async () => {
      billingPlansDbService.findById.mockResolvedValue(paidPlan);
      connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(50);

      await expect(target.canAddLocation('tenant-1')).resolves.toBe(true);
    });

    it('returns true while under the cap', async () => {
      connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(0);

      await expect(target.canAddLocation('tenant-1')).resolves.toBe(true);
    });

    it('returns false at the Free cap', async () => {
      connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(1);

      await expect(target.canAddLocation('tenant-1')).resolves.toBe(false);
    });
  });

  describe('canInviteTeamMember', () => {
    it('returns true when the plan has no team member cap', async () => {
      billingPlansDbService.findById.mockResolvedValue(paidPlan);
      authDbService.listTenantMembers.mockResolvedValue(Array(10).fill({}) as never[]);

      await expect(target.canInviteTeamMember('tenant-1')).resolves.toBe(true);
    });

    it('returns false at the Free cap of one member', async () => {
      authDbService.listTenantMembers.mockResolvedValue([{} as never]);

      await expect(target.canInviteTeamMember('tenant-1')).resolves.toBe(false);
    });
  });

  describe('canEditCustomPrompt', () => {
    it('reflects the plan column directly', async () => {
      await expect(target.canEditCustomPrompt('tenant-1')).resolves.toBe(false);

      billingPlansDbService.findById.mockResolvedValue(paidPlan);
      await expect(target.canEditCustomPrompt('tenant-1')).resolves.toBe(true);
    });
  });

  describe('enforceLocationLimitOnDowngrade', () => {
    it('does nothing when the plan has no location cap', async () => {
      // Only maxLocations matters: the method must bail out before taking the lock.
      billingPlansDbService.findByCode.mockResolvedValue(paidPlan);

      await target.enforceLocationLimitOnDowngrade('tenant-1');

      expect(connectionsDbService.withLocationSelectionLock).not.toHaveBeenCalled();
      expect(connectionsDbService.findLocationsByTenant).not.toHaveBeenCalled();
    });

    it('does nothing when the unpaused count is already within the cap', async () => {
      connectionsDbService.findLocationsByTenant.mockResolvedValue([
        baseLocation({ id: 'location-1' }),
      ]);

      await target.enforceLocationLimitOnDowngrade('tenant-1');

      expect(connectionsDbService.applyBillingLocationSelection).not.toHaveBeenCalled();
    });

    it('prefers tenants.active_location_id when it is among the unpaused locations', async () => {
      const locations = [
        baseLocation({ id: 'location-1', createdAt: '2026-01-01T00:00:00.000Z' }),
        baseLocation({ id: 'location-2', createdAt: '2026-01-02T00:00:00.000Z' }),
        baseLocation({ id: 'location-3', createdAt: '2026-01-03T00:00:00.000Z' }),
      ];
      connectionsDbService.findLocationsByTenant.mockResolvedValue(locations);
      authDbService.findActiveLocationId.mockResolvedValue('location-3');

      await target.enforceLocationLimitOnDowngrade('tenant-1');

      expect(connectionsDbService.applyBillingLocationSelection).toHaveBeenCalledWith(fakeTx, {
        keepLocationIds: ['location-3'],
        pauseLocationIds: ['location-1', 'location-2'],
      });
    });

    // Returned, not sent: a downgrade runs inside the webhook's transaction, which may still roll back.
    it('returns what it paused and kept, by name, and emails nobody itself', async () => {
      connectionsDbService.findLocationsByTenant.mockResolvedValue([
        baseLocation({
          id: 'location-1',
          name: 'Harbor St',
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        baseLocation({ id: 'location-2', name: 'Old Town', createdAt: '2026-01-02T00:00:00.000Z' }),
      ]);
      authDbService.findActiveLocationId.mockResolvedValue(null);

      await expect(target.enforceLocationLimitOnDowngrade('tenant-1')).resolves.toEqual({
        tenantId: 'tenant-1',
        maxLocations: 1,
        keptLocationNames: ['Harbor St'],
        pausedLocationNames: ['Old Town'],
      });
      expect(queueManager.addLocationsPausedEmailJob).not.toHaveBeenCalled();
    });

    it('returns nothing when nothing had to be paused', async () => {
      connectionsDbService.findLocationsByTenant.mockResolvedValue([
        baseLocation({ id: 'location-1' }),
      ]);

      await expect(target.enforceLocationLimitOnDowngrade('tenant-1')).resolves.toBeNull();
    });

    it('falls back to the oldest-connected location when active_location_id is unset or not among the unpaused ones', async () => {
      const locations = [
        baseLocation({ id: 'location-2', createdAt: '2026-01-02T00:00:00.000Z' }),
        baseLocation({ id: 'location-1', createdAt: '2026-01-01T00:00:00.000Z' }),
        baseLocation({ id: 'location-3', createdAt: '2026-01-03T00:00:00.000Z' }),
      ];
      connectionsDbService.findLocationsByTenant.mockResolvedValue(locations);
      authDbService.findActiveLocationId.mockResolvedValue(null);

      await target.enforceLocationLimitOnDowngrade('tenant-1');

      expect(connectionsDbService.applyBillingLocationSelection).toHaveBeenCalledWith(fakeTx, {
        keepLocationIds: ['location-1'],
        pauseLocationIds: ['location-2', 'location-3'],
      });
    });

    it('never counts an already-paused location toward what stays active', async () => {
      const locations = [
        baseLocation({ id: 'location-1', createdAt: '2026-01-01T00:00:00.000Z' }),
        baseLocation({
          id: 'location-2',
          createdAt: '2026-01-02T00:00:00.000Z',
          billingPausedAt: '2026-01-05T00:00:00.000Z',
        }),
      ];
      connectionsDbService.findLocationsByTenant.mockResolvedValue(locations);
      authDbService.findActiveLocationId.mockResolvedValue(null);

      await target.enforceLocationLimitOnDowngrade('tenant-1');

      expect(connectionsDbService.applyBillingLocationSelection).not.toHaveBeenCalled();
    });
  });

  describe('with PAYMENT_FEATURE_ENABLED off', () => {
    // There is no way to upgrade then, so a tenant must not be locked into Free's limits.
    it.each([['false'], [undefined]])(
      'lifts every Free limit (flag %s) but still reports the plan',
      async flag => {
        target = build(flag);
        connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(4);
        authDbService.listTenantMembers.mockResolvedValue(Array(3).fill({}) as never[]);
        reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(25);

        await expect(target.getEntitlements('tenant-1')).resolves.toEqual({
          planCode: BillingPlanCode.FREE,
          maxLocations: null,
          maxAiDraftsPerMonth: null,
          maxTeamMembers: null,
          customPromptsEnabled: true,
          activeLocationCount: 4,
          teamMemberCount: 3,
          aiDraftsUsedThisMonth: 25,
        });
      }
    );

    it('allows what Free would refuse', async () => {
      target = build('false');
      connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(1);
      authDbService.listTenantMembers.mockResolvedValue([{} as never]);
      reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(20);

      await expect(target.canAddLocation('tenant-1')).resolves.toBe(true);
      await expect(target.canInviteTeamMember('tenant-1')).resolves.toBe(true);
      await expect(target.canEditCustomPrompt('tenant-1')).resolves.toBe(true);
      await expect(target.getEntitlements('tenant-1')).resolves.toMatchObject({
        maxAiDraftsPerMonth: null,
      });
    });

    it('pauses no location on a downgrade to Free', async () => {
      target = build('false');
      connectionsDbService.findLocationsByTenant.mockResolvedValue([
        baseLocation({ id: 'location-1' }),
        baseLocation({ id: 'location-2' }),
      ]);

      await target.enforceLocationLimitOnDowngrade('tenant-1');

      expect(connectionsDbService.withLocationSelectionLock).not.toHaveBeenCalled();
      expect(connectionsDbService.applyBillingLocationSelection).not.toHaveBeenCalled();
    });
  });

  describe('notifyOwnersOfPausedLocations', () => {
    const notice = {
      tenantId: 'tenant-1',
      maxLocations: 1,
      keptLocationNames: ['Harbor St'],
      pausedLocationNames: ['Old Town'],
    };

    // Regression: the "your locations were paused" notice was only logged, so owners were never told.
    it('emails every owner, in their own language, which locations were paused and which stayed active', async () => {
      authDbService.findTenantOwnerRecipients.mockResolvedValue([
        { userId: 'u1', hasPassword: true, email: 'jane@example.com', name: 'Jane', locale: 'de' },
        { userId: 'u2', hasPassword: true, email: 'sam@example.com', name: 'Sam', locale: null },
      ]);

      await target.notifyOwnersOfPausedLocations(notice);

      expect(queueManager.addLocationsPausedEmailJob).toHaveBeenCalledTimes(2);
      expect(queueManager.addLocationsPausedEmailJob).toHaveBeenNthCalledWith(1, {
        email: 'jane@example.com',
        customerName: 'Jane',
        locale: 'de',
        businessName: 'Coastal Table',
        maxLocations: 1,
        keptLocationNames: ['Harbor St'],
        pausedLocationNames: ['Old Town'],
        settingsUrl: 'https://app.example.com/settings?tab=billing',
      });
      expect(queueManager.addLocationsPausedEmailJob).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ email: 'sam@example.com', locale: 'en' })
      );
    });

    it('never throws when the email cannot be queued', async () => {
      authDbService.findTenantOwnerRecipients.mockResolvedValue([
        { userId: 'u1', hasPassword: true, email: 'jane@example.com', name: 'Jane', locale: 'en' },
      ]);
      queueManager.addLocationsPausedEmailJob.mockRejectedValue(new Error('queue down'));

      await expect(target.notifyOwnersOfPausedLocations(notice)).resolves.toBeUndefined();
    });
  });

  describe('reapplyFreeLocationCap', () => {
    // Regression: locations added while limits were lifted stayed active on Free once payments were switched back on.
    it('applies the Free location cap to the Free tenants that are over it, when payments are on', async () => {
      tenantSubscriptionsDbService.findFreeTenantIdsOverLocationCap.mockResolvedValue([
        'tenant-1',
        'tenant-2',
      ]);
      connectionsDbService.withLocationSelectionLock.mockResolvedValue(null);

      await expect(target.reapplyFreeLocationCap()).resolves.toBe(2);

      expect(connectionsDbService.withLocationSelectionLock).toHaveBeenCalledTimes(2);
    });

    it('emails the owners of a tenant it paused locations for, once the pause is applied', async () => {
      tenantSubscriptionsDbService.findFreeTenantIdsOverLocationCap.mockResolvedValue(['tenant-1']);
      connectionsDbService.findLocationsByTenant.mockResolvedValue([
        baseLocation({ id: 'location-1' }),
        baseLocation({ id: 'location-2' }),
      ]);
      authDbService.findTenantOwnerRecipients.mockResolvedValue([
        { userId: 'u1', hasPassword: true, email: 'jane@example.com', name: 'Jane', locale: 'en' },
      ]);

      await target.reapplyFreeLocationCap();

      expect(queueManager.addLocationsPausedEmailJob).toHaveBeenCalledTimes(1);
    });

    it('does nothing while payments are off', async () => {
      target = build('false');

      await expect(target.reapplyFreeLocationCap()).resolves.toBe(0);

      expect(tenantSubscriptionsDbService.findFreeTenantIdsOverLocationCap).not.toHaveBeenCalled();
    });

    it("carries on with the other tenants when one tenant's enforcement fails", async () => {
      tenantSubscriptionsDbService.findFreeTenantIdsOverLocationCap.mockResolvedValue([
        'tenant-1',
        'tenant-2',
      ]);
      connectionsDbService.withLocationSelectionLock
        .mockRejectedValueOnce(new Error('lock timeout'))
        .mockResolvedValueOnce(null);

      await expect(target.reapplyFreeLocationCap()).resolves.toBe(2);

      expect(connectionsDbService.withLocationSelectionLock).toHaveBeenCalledTimes(2);
    });
  });

  describe('setActiveLocationForPlan', () => {
    it('throws LocationNotEligibleForActivationException when the location does not belong to the tenant', async () => {
      connectionsDbService.findLocationForTenant.mockResolvedValue(null);

      await expect(
        target.setActiveLocationForPlan('tenant-1', 'location-1')
      ).rejects.toBeInstanceOf(LocationNotEligibleForActivationException);
    });

    it('throws LocationNotEligibleForActivationException for a disconnected (inactive) location', async () => {
      connectionsDbService.findLocationForTenant.mockResolvedValue(
        baseLocation({ status: LocationStatus.INACTIVE })
      );

      await expect(
        target.setActiveLocationForPlan('tenant-1', 'location-1')
      ).rejects.toBeInstanceOf(LocationNotEligibleForActivationException);
    });

    it('is a no-op when the plan has no location cap', async () => {
      connectionsDbService.findLocationForTenant.mockResolvedValue(baseLocation({}));
      billingPlansDbService.findById.mockResolvedValue(paidPlan);

      await target.setActiveLocationForPlan('tenant-1', 'location-1');

      expect(connectionsDbService.applyBillingLocationSelection).not.toHaveBeenCalled();
    });

    it('always keeps exactly max_locations unpaused — pausing every other active location and unpausing the chosen one', async () => {
      connectionsDbService.findLocationForTenant.mockResolvedValue(
        baseLocation({ id: 'location-2', createdAt: '2026-01-02T00:00:00.000Z' })
      );
      connectionsDbService.findLocationsByTenant.mockResolvedValue([
        baseLocation({ id: 'location-1', createdAt: '2026-01-01T00:00:00.000Z' }),
        baseLocation({ id: 'location-2', createdAt: '2026-01-02T00:00:00.000Z' }),
        baseLocation({
          id: 'location-3',
          createdAt: '2026-01-03T00:00:00.000Z',
          billingPausedAt: '2026-01-04T00:00:00.000Z',
        }),
      ]);

      await target.setActiveLocationForPlan('tenant-1', 'location-2');

      expect(connectionsDbService.applyBillingLocationSelection).toHaveBeenCalledWith(fakeTx, {
        keepLocationIds: ['location-2'],
        pauseLocationIds: ['location-1', 'location-3'],
      });
    });
  });
});
