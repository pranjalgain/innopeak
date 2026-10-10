import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { BillingPlanCode } from '@common/enums/billing-plan-code.enum';
import { LocationStatus } from '@common/enums/location-status.enum';
import { DEFAULT_LOCALE } from '@common/i18n/locale';
import type { EnvConfig } from '@config/env.config';
import { DrizzleTransaction } from '@db/db.service';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { BillingPlansDbService } from '@db/repositories/billing/billing-plans.db-service';
import { TenantSubscriptionsDbService } from '@db/repositories/billing/tenant-subscriptions.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import type { LocationRow } from '@db/repositories/connections/types/connections.type';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { UNLIMITED_ENTITLEMENTS } from '../constants/billing.constants';
import {
  LocationNotEligibleForActivationException,
  PlanNotFoundException,
  SubscriptionNotFoundException,
} from '../exceptions/billing.exceptions';
import type { PausedLocationsNotice, TenantEntitlements } from '../types/billing.type';
import { isPaymentFeatureEnabled } from '../utils/payment-feature.util';

/** Usage window start for the monthly AI-draft count; a function so each call reads "now" fresh. */
function startOfCurrentMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Deliberately uncached: a webhook-driven plan change must apply on the very next request.
 *
 * With `PAYMENT_FEATURE_ENABLED` off there is no way to upgrade, so plan limits are lifted for every tenant rather
 * than locking them into Free: unlimited locations, AI drafts and team members, and custom prompts. The plan itself
 * (`planCode`) is reported unchanged.
 */
@Injectable()
export class BillingEntitlementsService {
  private readonly logger = new Logger(BillingEntitlementsService.name);
  private readonly limitsApply: boolean;
  private readonly frontendUrl: string;

  constructor(
    private readonly tenantSubscriptionsDbService: TenantSubscriptionsDbService,
    private readonly billingPlansDbService: BillingPlansDbService,
    private readonly connectionsDbService: ConnectionsDbService,
    private readonly authDbService: AuthDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly queueManager: AddingJobsToQueueManager,
    configService: ConfigService<EnvConfig>
  ) {
    this.limitsApply = isPaymentFeatureEnabled(configService);
    this.frontendUrl = (configService.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
  }

  /**
   * Limits are lifted while payments are off, so Free tenants may have grown past the Free location cap. When payments
   * come back on this applies it again (pausing the extras, as a downgrade does). Only tenants actually over the cap
   * are touched, found in one query, so it is near-free when there is nothing to do. Team members and past AI usage
   * are not retroactive: their caps only block further additions. Run at API startup by `FreePlanCapStartup`.
   * Returns how many tenants were brought back under the cap.
   */
  async reapplyFreeLocationCap(): Promise<number> {
    if (!this.limitsApply) {
      return 0;
    }

    const tenantIds = await this.tenantSubscriptionsDbService.findFreeTenantIdsOverLocationCap();
    for (const tenantId of tenantIds) {
      try {
        // No caller transaction here: the pause is committed by the time the owners are told.
        const notice = await this.enforceLocationLimitOnDowngrade(tenantId);
        if (notice) {
          await this.notifyOwnersOfPausedLocations(notice);
        }
      } catch (error) {
        // One tenant's failure must not starve the rest.
        this.logger.error(
          `Could not re-apply the Free location cap for tenant ${tenantId}: ${(error as Error).message}`
        );
      }
    }
    return tenantIds.length;
  }

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

    const limits = this.limitsApply
      ? {
          maxLocations: plan.maxLocations,
          maxAiDraftsPerMonth: plan.maxAiDraftsPerMonth,
          maxTeamMembers: plan.maxTeamMembers,
          customPromptsEnabled: plan.customPromptsEnabled,
        }
      : UNLIMITED_ENTITLEMENTS;

    return {
      planCode: plan.code,
      ...limits,
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

  /**
   * Runs inside the subscription-deleted webhook's transaction. Keeps `tenants.active_location_id`
   * if still unpaused, else the oldest-connected location, and pauses the rest.
   *
   * Reads the Free plan by code, not via `getEntitlements`: the plan_id flip is uncommitted in `tx`,
   * so a separate connection would still see the old (unlimited) plan and skip the pause.
   * "Oldest" uses each location's own `created_at`: locations sharing one connection would tie on
   * the connection's timestamp.
   */
  async enforceLocationLimitOnDowngrade(
    tenantId: string,
    tx?: DrizzleTransaction
  ): Promise<PausedLocationsNotice | null> {
    // Nothing to pause while payments are off: Free has no location cap then (see the class comment).
    if (!this.limitsApply) {
      return null;
    }

    const freePlan = await this.billingPlansDbService.findByCode(BillingPlanCode.FREE, tx);
    const maxLocations = freePlan?.maxLocations ?? null;
    if (maxLocations === null) {
      return null;
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

        const nameOf = new Map(unpaused.map(location => [location.id, location.name]));
        return {
          keptLocationNames: [...keepIds].map(id => nameOf.get(id) ?? id),
          pausedLocationNames: pauseIds.map(id => nameOf.get(id) ?? id),
        };
      },
      tx
    );

    return notification ? { tenantId, maxLocations, ...notification } : null;
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

  /**
   * Tells every owner which locations were paused and which stayed active, in their own language. Call it only once the
   * pause is committed: `enforceLocationLimitOnDowngrade` returns the notice instead of sending, so a webhook can send
   * after its transaction commits rather than while it holds locks (or for a pause that then rolls back). Best-effort:
   * a failure is logged, never thrown.
   */
  async notifyOwnersOfPausedLocations(notice: PausedLocationsNotice): Promise<void> {
    try {
      const [owners, tenant] = await Promise.all([
        this.authDbService.findTenantOwnerRecipients(notice.tenantId),
        this.authDbService.findTenantStatus(notice.tenantId),
      ]);
      for (const owner of owners) {
        await this.queueManager.addLocationsPausedEmailJob({
          email: owner.email,
          customerName: owner.name,
          locale: owner.locale ?? DEFAULT_LOCALE,
          businessName: tenant?.name ?? '',
          maxLocations: notice.maxLocations,
          keptLocationNames: notice.keptLocationNames,
          pausedLocationNames: notice.pausedLocationNames,
          settingsUrl: `${this.frontendUrl}/settings?tab=billing`,
        });
      }
    } catch (error) {
      this.logger.error(
        `Paused ${notice.pausedLocationNames.length} location(s) for tenant ${notice.tenantId} but could not notify its owners: ${(error as Error).message}`
      );
    }
  }
}
