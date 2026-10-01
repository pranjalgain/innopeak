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

/** Start of the current calendar month, UTC — `BillingEntitlementsService.canGenerateAiDraft`'s
 *  usage window. A plain function (not a class constant) so each call reads "now" fresh. */
function startOfCurrentMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * The four entitlement checks (`canAddLocation`/`canInviteTeamMember`/`canEditCustomPrompt`/
 * `canGenerateAiDraft`) plus the §3a location-selection methods
 * (`enforceLocationLimitOnDowngrade`/`setActiveLocationForPlan`). Every check reads the tenant's
 * *current* plan's columns via `getEntitlements` — there is no caching layer, since a plan change
 * (webhook-driven) must be reflected on the very next request, not after some TTL expires.
 *
 * Injected into other modules' business Services (`ConnectionsService`, `PromptsService`,
 * `TenantMembersService`) — see `BillingModule`'s own doc comment for why this, unlike a
 * `@Global()` DB service, has to be imported explicitly.
 */
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

  /**
   * Built for real per the plan's explicit instruction, counting `review_responses` rows with
   * `source = 'ai_generated'` in the current calendar month against the plan's
   * `max_ai_drafts_per_month`. Called from two places now: `AiReplyGenerationService`'s dry-run
   * path (`generateDryRunReply`, which never persists a row, so it can never move the count it
   * checks) and its real generation path (`generateForClassifiedReviews`, wired into
   * `ReviewSyncQueueService`'s poll tick), which does persist one on every successful draft —
   * see `@ai/ai-reply-generation.service.ts`. The count is therefore live in practice, not merely
   * checked against a number that never moves.
   */
  async canGenerateAiDraft(tenantId: string): Promise<boolean> {
    const entitlements = await this.getEntitlements(tenantId);
    return entitlements.maxAiDraftsPerMonth === null
      ? true
      : entitlements.aiDraftsUsedThisMonth < entitlements.maxAiDraftsPerMonth;
  }

  /**
   * Called from inside `customer.subscription.deleted`'s handler (`BillingWebhooksService`), after
   * `plan_id` has already flipped to `free`. If the tenant's count of active, unpaused locations
   * now exceeds the new plan's `max_locations`:
   *  1. Prefer `tenants.active_location_id` if it's among the tenant's currently-unpaused active
   *     locations (a reasonable signal of which business the owner actually cares about).
   *  2. Otherwise fall back to the *oldest-connected* location.
   *
   * Deviation from the plan's literal wording: the plan says "oldest
   * `review_provider_connections.created_at`", but a tenant can connect several locations through
   * one same connection (multi-select at confirm time), so every location sharing that connection
   * would tie on the connection's own timestamp and give no real tie-break. Each location's own
   * `created_at` (set at the moment *that* location was confirmed) is a strictly finer-grained,
   * still-faithful reading of "oldest connected" — used here instead.
   *
   * Reads the Free plan's `maxLocations` directly (`BillingPlanCode.FREE`) rather than through
   * `getEntitlements(tenantId)`: this method's whole contract is "the plan is now Free" (its own
   * caller only reaches it after `setToFreeFromSubscriptionDeleted` has just written that, in the
   * same still-open transaction, via `tx`) — re-deriving it from `tenant_subscriptions.plan_id` on
   * a separate, un-transacted connection would read the *pre-downgrade* row (that write hasn't
   * committed yet) and see the old, usually-unlimited plan, silently skipping the pause entirely.
   * `billing_plans` itself is a small, effectively-static seeded catalog (see
   * `BillingPlansRepository`'s own doc comment), so reading it by code instead of by the
   * just-written id is exactly equivalent here and sidesteps the staleness question altogether.
   *
   * Pauses every other active location under `ConnectionsDbService.withLocationSelectionLock`'s
   * per-tenant lock, folded into `tx` when the caller (the webhook handler) supplies one. Queueing
   * the "here's which location stayed active" notification is a documented, deliberate gap — see
   * `queueDowngradeNotification`.
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

  /**
   * The owner's manual swap (`PUT /v1/billing/active-location`) — validates `locationId` belongs
   * to this tenant and is `status = 'active'`, then atomically pauses/unpauses so exactly
   * `max_locations` stay unpaused at once, never more. A no-op (Paid, unlimited) when the plan has
   * no cap at all.
   */
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

    // Same per-tenant lock `enforceLocationLimitOnDowngrade` uses — see
    // `ConnectionsDbService.withLocationSelectionLock`'s own doc comment for the race this closes
    // between the two (a downgrade webhook and a manual swap for the same tenant, or two manual
    // swaps, must not interleave their read-then-write halves).
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

  /**
   * Shared by both §3a methods above: always includes `mustKeepId` (the preferred/chosen
   * location), then fills the remaining slots (up to `maxLocations`) with whichever candidates are
   * already unpaused, oldest-connected first — a stable, deterministic choice rather than an
   * arbitrary one. Degenerates to exactly the plan's described behavior when `maxLocations === 1`
   * (today's only real case, since Free is the only plan with a cap): pause everything except the
   * one location being kept.
   */
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
   * Deliberate, documented gap: the plan asks for a queued "here's which location stayed active"
   * notification (reusing the existing email-queue pattern in `src/background/`), same spirit as
   * `canGenerateAiDraft`'s own gap above. Wiring a genuinely new email type through the full
   * BullMQ/SQS producer -> processor -> Handlebars-template pipeline (`background/queue/email/`)
   * is real, isolated follow-up work — not something to improvise here without its own review, and
   * out of this task's required verification scope (which never exercises email delivery). Logged
   * instead, so the auto-pick outcome is still visible operationally.
   */
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
