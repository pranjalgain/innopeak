import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import type {
  ExportBilling,
  ExportBusiness,
  ExportLocation,
  ExportNotificationRecipient,
  ExportPrompt,
  ExportResponse,
  ExportReview,
  ExportSettings,
  ExportTeamMember,
} from './types/tenant-export.type';

/** Every query filters by `tenant_id` itself, never by a previously fetched id compared after, so one tenant's export can't contain another's rows. */
@Injectable()
export class TenantExportRepository {
  constructor(private readonly dbService: DBService) {}

  async getBusiness(tenantId: string): Promise<ExportBusiness | null> {
    const rows = await this.dbService.db
      .select({
        name: schema.tenants.name,
        status: schema.tenants.status,
        createdAt: schema.tenants.createdAt,
      })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** Anonymized members are gone for good and not exported; one merely pending removal still is. */
  listTeam(tenantId: string): Promise<ExportTeamMember[]> {
    return this.dbService.db
      .select({
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
        status: schema.users.status,
        createdAt: schema.users.createdAt,
      })
      .from(schema.users)
      .where(and(eq(schema.users.tenantId, tenantId), isNull(schema.users.anonymizedAt)))
      .orderBy(asc(schema.users.createdAt));
  }

  async getSettings(tenantId: string): Promise<ExportSettings | null> {
    const rows = await this.dbService.db
      .select({
        escalationRatingThreshold: schema.tenantSettings.escalationRatingThreshold,
        autoPostEnabled: schema.tenantSettings.autoPostEnabled,
        reviewDataRetentionMonths: schema.tenantSettings.reviewDataRetentionMonths,
        aiReplyCount: schema.tenantSettings.aiReplyCount,
      })
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.tenantId, tenantId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listBlocklist(tenantId: string): Promise<string[]> {
    const rows = await this.dbService.db
      .select({ term: schema.blocklistTerms.term })
      .from(schema.blocklistTerms)
      .where(eq(schema.blocklistTerms.tenantId, tenantId))
      .orderBy(asc(schema.blocklistTerms.term));
    return rows.map(row => row.term);
  }

  listNotificationRecipients(tenantId: string): Promise<ExportNotificationRecipient[]> {
    return this.dbService.db
      .select({
        email: schema.users.email,
        notificationType: schema.notificationRecipients.notificationType,
        channel: schema.notificationRecipients.channel,
        isActive: schema.notificationRecipients.isActive,
      })
      .from(schema.notificationRecipients)
      .innerJoin(schema.users, eq(schema.notificationRecipients.userId, schema.users.id))
      .where(eq(schema.notificationRecipients.tenantId, tenantId))
      .orderBy(asc(schema.notificationRecipients.createdAt));
  }

  listLocations(tenantId: string): Promise<ExportLocation[]> {
    return this.dbService.db
      .select({
        id: schema.locations.id,
        name: schema.locations.name,
        address: schema.locations.address,
        provider: schema.locations.provider,
        status: schema.locations.status,
        createdAt: schema.locations.createdAt,
      })
      .from(schema.locations)
      .where(eq(schema.locations.tenantId, tenantId))
      .orderBy(asc(schema.locations.createdAt));
  }

  async listPrompts(tenantId: string): Promise<ExportPrompt[]> {
    const prompts = await this.dbService.db
      .select({
        id: schema.prompts.id,
        category: schema.prompts.category,
        name: schema.prompts.name,
        description: schema.prompts.description,
        tone: schema.prompts.tone,
      })
      .from(schema.prompts)
      .where(eq(schema.prompts.tenantId, tenantId))
      .orderBy(asc(schema.prompts.createdAt));
    if (prompts.length === 0) {
      return [];
    }

    const versions = await this.dbService.db
      .select({
        promptId: schema.promptVersions.promptId,
        version: schema.promptVersions.version,
        template: schema.promptVersions.template,
        createdAt: schema.promptVersions.createdAt,
      })
      .from(schema.promptVersions)
      .where(
        inArray(
          schema.promptVersions.promptId,
          prompts.map(prompt => prompt.id)
        )
      )
      .orderBy(asc(schema.promptVersions.version));

    return prompts.map(({ id, ...prompt }) => ({
      ...prompt,
      versions: versions
        .filter(version => version.promptId === id)
        .map(({ promptId: _promptId, ...version }) => version),
    }));
  }

  /** Keyset page over `reviews.id` (uuidv7, roughly chronological): stable under concurrent inserts, constant cost unlike
   *  `OFFSET`. A reviewer's name is withheld once the retention job anonymized it. */
  async listReviewsAfter(input: {
    tenantId: string;
    afterId: string | null;
    limit: number;
  }): Promise<ExportReview[]> {
    const rows = await this.dbService.db
      .select({
        id: schema.reviews.id,
        locationId: schema.reviews.locationId,
        rating: schema.reviews.rating,
        text: schema.reviews.reviewText,
        reviewerName: schema.reviews.reviewerName,
        anonymizedAt: schema.reviews.anonymizedAt,
        reviewedAt: schema.reviews.reviewedAt,
        sentiment: schema.reviews.sentiment,
        classification: schema.reviews.classification,
        status: schema.reviews.status,
      })
      .from(schema.reviews)
      .where(
        and(
          eq(schema.reviews.tenantId, input.tenantId),
          input.afterId ? gt(schema.reviews.id, input.afterId) : undefined
        )
      )
      .orderBy(asc(schema.reviews.id))
      .limit(input.limit);

    return rows.map(({ anonymizedAt, ...row }) => ({
      ...row,
      reviewerName: anonymizedAt ? null : row.reviewerName,
    }));
  }

  listResponsesForReviews(input: {
    tenantId: string;
    reviewIds: string[];
  }): Promise<ExportResponse[]> {
    if (input.reviewIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.dbService.db
      .select({
        reviewId: schema.reviewResponses.reviewId,
        type: schema.reviewResponses.responseType,
        content: schema.reviewResponses.content,
        source: schema.reviewResponses.source,
        status: schema.reviewResponses.status,
        postedAt: schema.reviewResponses.postedAt,
        createdAt: schema.reviewResponses.createdAt,
      })
      .from(schema.reviewResponses)
      .where(
        and(
          eq(schema.reviewResponses.tenantId, input.tenantId),
          inArray(schema.reviewResponses.reviewId, input.reviewIds)
        )
      )
      .orderBy(asc(schema.reviewResponses.createdAt));
  }

  async getBilling(tenantId: string): Promise<ExportBilling> {
    const subscriptions = await this.dbService.db
      .select({
        plan: schema.billingPlans.code,
        status: schema.tenantSubscriptions.status,
        currentPeriodEnd: schema.tenantSubscriptions.currentPeriodEnd,
      })
      .from(schema.tenantSubscriptions)
      .innerJoin(schema.billingPlans, eq(schema.tenantSubscriptions.planId, schema.billingPlans.id))
      .where(eq(schema.tenantSubscriptions.tenantId, tenantId))
      .limit(1);

    const receipts = await this.dbService.db
      .select({
        invoiceNumber: schema.billingReceipts.invoiceNumber,
        amountPaid: schema.billingReceipts.amountPaid,
        currency: schema.billingReceipts.currency,
        paidAt: schema.billingReceipts.paidAt,
      })
      .from(schema.billingReceipts)
      .where(eq(schema.billingReceipts.tenantId, tenantId))
      .orderBy(asc(schema.billingReceipts.paidAt));

    const subscription = subscriptions[0];
    return {
      plan: subscription?.plan ?? null,
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
      receipts,
    };
  }
}
