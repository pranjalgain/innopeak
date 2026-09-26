import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import type { DrizzleTransaction } from '@db/db.service';
import type { AuthDbService } from '@db/repositories/auth/auth.db-service';
import type { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import type { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import type { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { LocationRow } from '@db/repositories/connections/connections.repository';
import type { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';

/** Opaque stand-in for the real Drizzle transaction handle `withLocationSelectionLock` threads
 *  through to `applyBillingLocationSelection`. */
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
  let target: BillingEntitlementsService;
  let tenantSubscriptionsDbService: jest.Mocked<
    Pick<TenantSubscriptionsDbService, 'findByTenantId'>
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
  let authDbService: jest.Mocked<Pick<AuthDbService, 'findActiveLocationId' | 'listTenantMembers'>>;
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
  };

  beforeEach(() => {
    tenantSubscriptionsDbService = { findByTenantId: jest.fn() };
    billingPlansDbService = { findByCode: jest.fn(), findById: jest.fn() };
    connectionsDbService = {
      countActiveUnpausedLocations: jest.fn(),
      findLocationsByTenant: jest.fn(),
      findLocationForTenant: jest.fn(),
      applyBillingLocationSelection: jest.fn(),
      withLocationSelectionLock: jest.fn(),
    };
    authDbService = { listTenantMembers: jest.fn(), findActiveLocationId: jest.fn() };
    reviewSyncDbService = { countAiGeneratedResponsesThisMonth: jest.fn() };

    target = new BillingEntitlementsService(
      tenantSubscriptionsDbService as unknown as TenantSubscriptionsDbService,
      billingPlansDbService as unknown as BillingPlansDbService,
      connectionsDbService as unknown as ConnectionsDbService,
      authDbService as unknown as AuthDbService,
      reviewSyncDbService as unknown as ReviewSyncDbService
    );

    tenantSubscriptionsDbService.findByTenantId.mockResolvedValue(subscription);
    billingPlansDbService.findById.mockResolvedValue(freePlan);
    // `enforceLocationLimitOnDowngrade` reads the Free plan directly by code (see that method's
    // own doc comment for why) — default it to the same shape `findById` already defaults to.
    billingPlansDbService.findByCode.mockResolvedValue(freePlan);
    connectionsDbService.countActiveUnpausedLocations.mockResolvedValue(0);
    authDbService.listTenantMembers.mockResolvedValue([]);
    reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(0);
    // Fakes `ConnectionsDbService.withLocationSelectionLock`: no real lock/transaction to
    // simulate, just resolves `findLocationsByTenant`'s own mock and hands it (plus a fake tx) to
    // the caller's callback — existing `findLocationsByTenant.mockResolvedValue(...)` setups below
    // keep working unchanged.
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

  describe('canGenerateAiDraft', () => {
    it('returns true when the plan has no AI draft cap', async () => {
      billingPlansDbService.findById.mockResolvedValue(paidPlan);
      reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(1000);

      await expect(target.canGenerateAiDraft('tenant-1')).resolves.toBe(true);
    });

    it('returns false once the monthly cap is reached', async () => {
      reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(20);

      await expect(target.canGenerateAiDraft('tenant-1')).resolves.toBe(false);
    });

    it('returns true below the cap', async () => {
      reviewSyncDbService.countAiGeneratedResponsesThisMonth.mockResolvedValue(19);

      await expect(target.canGenerateAiDraft('tenant-1')).resolves.toBe(true);
    });
  });

  describe('enforceLocationLimitOnDowngrade', () => {
    it('does nothing when the plan has no location cap', async () => {
      // Not a realistic Free-plan shape (Free is the only plan with a cap today) — only
      // `maxLocations` matters here, confirming the method bails out before ever taking the lock.
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

      // Only one unpaused location exists, which is <= maxLocations(1) — nothing to do.
      expect(connectionsDbService.applyBillingLocationSelection).not.toHaveBeenCalled();
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
