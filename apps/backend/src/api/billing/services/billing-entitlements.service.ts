import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { DrizzleTransaction } from '@db/db.service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { LocationRow } from '@db/repositories/connections/types/connections.type';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';

import {
  LocationNotEligibleForActivationException,
  PlanNotFoundException,
  SubscriptionNotFoundException,
} from '../exceptions/billing.exceptions';
import type { TenantEntitlements } from '../types/billing.type';

/** Usage window start for canGenerateAiDraft; a function so each call reads "now" fresh. */
function startOfCurrentMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Deliberately uncached: a webhook-driven plan change must apply on the very next request. */
@Injectable()
export class BillingEntitlementsService {
  private readonly logger = new Logger(BillingEntitlementsService.name);

  constructor(
    private readonly tenantSubscriptionsDbService: TenantSubscriptionsDbService,
    private readonly billingPlansDbService: BillingPlansDbService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly authDbService: AuthDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService
  ) {}

  async getEntitlements(tenantId: string): Promise<TenantEntitlements> {
    const subscription = await this.tenantSubscriptionsDbService.findByTenantId(tenantId);
    if (!subscription) {
      throw new SubscriptionNotFoundException();
    }

    const plan = await this.billingPlansDbService.findById(subscription.planId);
    if (!plan) {
      throw new PlanNotFoundException();
    }

    const [activeLocationCount, members, aiDraftsUsedThisMonth] = await Promise.all([
      this.connectionsDbService.countActiveUnpausedLocations(tenantId),
      this.authDbService.listTenantMembers(tenantId),
      this.reviewSyncDbService.countAiGeneratedResponsesThisMonth(
        tenantId,
        startOfCurrentMonthUtc()
      ),
    ]);

    return {
      planCode: plan.code,
      maxLocations: plan.maxLocations,
      maxAiDraftsPerMonth: plan.maxAiDraftsPerMonth,
      maxTeamMembers: plan.maxTeamMembers,
      customPromptsEnabled: plan.customPromptsEnabled,
      activeLocationCount,
      teamMemberCount: members.length,
      aiDraftsUsedThisMonth,
    };
  }

  async canAddLocation(tenantId: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(tenantId);
    return entitlements.maxLocations === null
      ? true
      : entitlements.activeLocationCount < entitlements.maxLocations;
  }

  async canInviteTeamMember(tenantId: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(tenantId);
    return entitlements.maxTeamMembers === null
      ? true
      : entitlements.teamMemberCount < entitlements.maxTeamMembers;
  }

  async canEditCustomPrompt(tenantId: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(tenantId);
    return entitlements.customPromptsEnabled;
  }

  /** Counts `review_responses` with `source = 'ai_generated'` this calendar month. The dry-run path never persists a row, so only real generation moves the count. */
  async canGenerateAiDraft(tenantId: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(tenantId);
    return entitlements.maxAiDraftsPerMonth === null
      ? true
      : entitlements.aiDraftsUsedThisMonth < entitlements.maxAiDraftsPerMonth;
  }

  /**
   * Runs inside the subscription-deleted webhook's transaction. Keeps `tenants.active_location_id`
   * if still unpaused, else the oldest-connected location, and pauses the rest.
   *
   * Reads the Free plan by code, not via `getEntitlements`: the plan_id flip is uncommitted in `tx`,
   * so a separate connection would still see the old (unlimited) plan and skip the pause.
   * "Oldest" uses each location's own `created_at`: locations sharing one connection would tie on
   * the connection's timestamp.
   */
  async enforceLocationLimitOnDowngrade(tenantId: string, tx?: DrizzleTransaction): Promise<void> {
    const freePlan = await this.billingPlansDbService.findByCode(BillingPlanCode.FREE, tx);
    const maxLocations = freePlan?.maxLocations ?? null;
    if (maxLocations === null) {
      return;
    }

    const preferredLocationId = await this.authDbService.findActiveLocationId(tenantId);

    const notification = await this.connectionsDbService.withLocationSelectionLock(
      tenantId,
      async (lockedTx, activeLocations) => {
        const unpaused = activeLocations.filter(location => location.billingPausedAt === null);
        if (unpaused.length <= maxLocations) {
          return null;
        }

        const keepIds = this.pickLocationsToKeep(unpaused, maxLocations, preferredLocationId);
        const pauseIds = unpaused.filter(location => !keepIds.has(location.id)).map(l => l.id);
        if (pauseIds.length === 0) {
          return null;
        }

        await this.connectionsDbService.applyBillingLocationSelection(lockedTx, {
          keepLocationIds: [...keepIds],
          pauseLocationIds: pauseIds,
        });

        return { keptLocationIds: [...keepIds], pausedLocationIds: pauseIds };
      },
      tx
    );

    if (notification) {
      this.queueDowngradeNotification(
        tenantId,
        notification.keptLocationIds,
        notification.pausedLocationIds
      );
    }
  }

  /** The owner's manual swap; a no-op when the plan has no location cap. */
  async setActiveLocationForPlan(tenantId: string, locationId: string): Promise<void> {
    const location = await this.connectionsDbService.findLocationForTenant(locationId, tenantId);
    if (location?.status !== LocationStatus.ACTIVE) {
      throw new LocationNotEligibleForActivationException();
    }

    const entitlements = await this.getEntitlements(tenantId);
    const maxLocations = entitlements.maxLocations;
    if (maxLocations === null) {
      return;
    }

    // Same lock as enforceLocationLimitOnDowngrade, so a downgrade webhook and a swap (or two swaps) can't interleave.
    await this.connectionsDbService.withLocationSelectionLock(
      tenantId,
      async (tx, activeLocations) => {
        const keepIds = this.pickLocationsToKeep(activeLocations, maxLocations, location.id);
        const pauseIds = activeLocations.filter(l => !keepIds.has(l.id)).map(l => l.id);

        await this.connectionsDbService.applyBillingLocationSelection(tx, {
          keepLocationIds: [...keepIds],
          pauseLocationIds: pauseIds,
        });
      }
    );
  }

  /** Always keeps `mustKeepId`, then fills remaining slots with already-unpaused candidates, oldest first (deterministic). */
  private pickLocationsToKeep(
    candidates: LocationRow[],
    maxLocations: number,
    mustKeepId: string | null
  ): Set<string> {
    const keepIds = new Set<string>();
    const preferred = mustKeepId ? candidates.find(l => l.id === mustKeepId) : undefined;
    if (preferred) {
      keepIds.add(preferred.id);
    }

    const sorted = [...candidates].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const candidate of sorted) {
      if (keepIds.size >= maxLocations) {
        break;
      }
      if (candidate.billingPausedAt === null) {
        keepIds.add(candidate.id);
      }
    }

    return keepIds;
  }

  /** The "which location stayed active" owner email is deliberately not wired yet (it needs a new email type through the queue pipeline); logged instead. */
  private queueDowngradeNotification(
    tenantId: string,
    keptLocationIds: string[],
    pausedLocationIds: string[]
  ): void {
    this.logger.log(
      `Tenant ${tenantId} downgraded over its plan's location limit — kept ${JSON.stringify(
        keptLocationIds
      )} active, paused ${JSON.stringify(pausedLocationIds)}. ` +
        "Owner notification email is not yet wired — see this method's own doc comment."
    );
  }
}
