import { Injectable } from '@nestjs/common';

import { TenantExportRepository } from './tenant-export.repository';
import type {
  ExportResponse,
  ExportReview,
  TenantExportSections,
} from './types/tenant-export.type';

/** Composes the repository's reads into two shapes: small sections fetched once, and review batches fetched page by page. */
@Injectable()
export class TenantExportDbService {
  constructor(private readonly tenantExportRepository: TenantExportRepository) {}

  async getSections(tenantId: string): Promise<TenantExportSections> {
    const [
      business,
      team,
      settings,
      blocklist,
      notificationRecipients,
      locations,
      prompts,
      billing,
    ] = await Promise.all([
      this.tenantExportRepository.getBusiness(tenantId),
      this.tenantExportRepository.listTeam(tenantId),
      this.tenantExportRepository.getSettings(tenantId),
      this.tenantExportRepository.listBlocklist(tenantId),
      this.tenantExportRepository.listNotificationRecipients(tenantId),
      this.tenantExportRepository.listLocations(tenantId),
      this.tenantExportRepository.listPrompts(tenantId),
      this.tenantExportRepository.getBilling(tenantId),
    ]);

    return {
      business,
      team,
      settings,
      blocklist,
      notificationRecipients,
      locations,
      prompts,
      billing,
    };
  }

  /** One page of reviews with every reply attached, `null` cursor = first page. */
  async getReviewBatch(input: {
    tenantId: string;
    afterId: string | null;
    limit: number;
  }): Promise<{
    reviews: Array<ExportReview & { responses: Omit<ExportResponse, 'reviewId'>[] }>;
  }> {
    const reviews = await this.tenantExportRepository.listReviewsAfter(input);
    const responses = await this.tenantExportRepository.listResponsesForReviews({
      tenantId: input.tenantId,
      reviewIds: reviews.map(review => review.id),
    });

    return {
      reviews: reviews.map(review => ({
        ...review,
        responses: responses
          .filter(response => response.reviewId === review.id)
          .map(({ reviewId: _reviewId, ...response }) => response),
      })),
    };
  }
}
