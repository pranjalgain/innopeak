import { EscalationReason } from '@common/enums/escalation-reason.enum';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { ReviewSentiment } from '@common/enums/review-sentiment.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike, inArray } from 'drizzle-orm';

export interface ReviewRow {
  id: string;
  locationId: string;
  externalReviewId: string;
  reviewerName: string | null;
  rating: number;
  reviewText: string | null;
  reviewedAt: string | null;
  externalUpdatedAt: string | null;
  sentiment: ReviewSentiment | null;
  classification: ReviewClassification;
  escalationReason: EscalationReason | null;
  // Drizzle infers a bare `jsonb` column as `unknown`; narrowed here to what every writer
  // actually stores (`ReviewSyncRepository.claimClassification`'s `ClaimClassificationInput`),
  // the same boundary-bridging this repository already does for enum columns.
  matchedKeywords: string[] | null;
  status: ReviewStatus;
  anonymizedAt: string | null;
  removedUpstreamAt: string | null;
}

export interface ReviewResponseRow {
  id: string;
  reviewId: string;
  generationGroupId: string | null;
  responseType: ResponseType;
  content: string;
  originalContent: string | null;
  source: ResponseSource;
  status: ResponseStatus;
  createdByUserId: string | null;
  approvedByUserId: string | null;
  createdAt: string;
  decidedAt: string | null;
  postedAt: string | null;
  errorMessage: string | null;
}

export interface ListReviewsFilter {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: ReviewStatus | undefined;
  classification?: ReviewClassification | undefined;
  locationId?: string | undefined;
  search?: string | undefined;
}

const REVIEW_COLUMNS = {
  id: schema.reviews.id,
  locationId: schema.reviews.locationId,
  externalReviewId: schema.reviews.externalReviewId,
  reviewerName: schema.reviews.reviewerName,
  rating: schema.reviews.rating,
  reviewText: schema.reviews.reviewText,
  reviewedAt: schema.reviews.reviewedAt,
  externalUpdatedAt: schema.reviews.externalUpdatedAt,
  sentiment: schema.reviews.sentiment,
  classification: schema.reviews.classification,
  escalationReason: schema.reviews.escalationReason,
  matchedKeywords: schema.reviews.matchedKeywords,
  status: schema.reviews.status,
  anonymizedAt: schema.reviews.anonymizedAt,
  removedUpstreamAt: schema.reviews.removedUpstreamAt,
} as const;

const RESPONSE_COLUMNS = {
  id: schema.reviewResponses.id,
  reviewId: schema.reviewResponses.reviewId,
  generationGroupId: schema.reviewResponses.generationGroupId,
  responseType: schema.reviewResponses.responseType,
  content: schema.reviewResponses.content,
  originalContent: schema.reviewResponses.originalContent,
  source: schema.reviewResponses.source,
  status: schema.reviewResponses.status,
  createdByUserId: schema.reviewResponses.createdByUserId,
  approvedByUserId: schema.reviewResponses.approvedByUserId,
  createdAt: schema.reviewResponses.createdAt,
  decidedAt: schema.reviewResponses.decidedAt,
  postedAt: schema.reviewResponses.postedAt,
  errorMessage: schema.reviewResponses.errorMessage,
  // `generation_metadata` is deliberately absent: it holds model name, region and token counts
  // for server-side debugging and is not user-facing.
} as const;

/**
 * Postgres's `LIKE`/`ILIKE` treat `%` and `_` as wildcards and `\` as the escape character itself
 * — none of which a reviewer-name search term should be interpreted as. Without this, searching
 * for a reviewer literally named "50% Off Dave" or "J_ne" matches an unrelated, much broader (or
 * narrower) set of rows than the literal substring the owner typed.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}

/**
 * Read-only queries over `reviews` + `review_responses` for the review queue. Split from
 * `ReviewSyncRepository` by *direction*, not by table: that one owns every write these tables
 * take, this one only reads. Keeping both in the `review-sync` domain preserves the "one domain
 * owns each table" rule the connections overview asks for.
 */
@Injectable()
export class ReviewsReadRepository {
  constructor(private readonly dbService: DBService) {}

  async listReviews(filter: ListReviewsFilter): Promise<{ reviews: ReviewRow[]; total: number }> {
    const conditions = [eq(schema.reviews.tenantId, filter.tenantId)];

    if (filter.status) {
      conditions.push(eq(schema.reviews.status, filter.status));
    }
    if (filter.classification) {
      conditions.push(eq(schema.reviews.classification, filter.classification));
    }
    if (filter.locationId) {
      // Not validated against the tenant's own locations first: the tenantId condition above
      // already scopes the result, so a foreign id yields an empty page rather than a 403 that
      // would confirm the id exists.
      conditions.push(eq(schema.reviews.locationId, filter.locationId));
    }
    if (filter.search) {
      // Reviewer name only, matching the frontend's own search behaviour. An anonymized row has
      // a NULL name and therefore never matches, which is the intended privacy outcome.
      // `escapeLikePattern` is what keeps this a literal substring match — Postgres's default `\`
      // escape character makes the escaped pattern interpretable without an explicit ESCAPE clause.
      conditions.push(ilike(schema.reviews.reviewerName, `%${escapeLikePattern(filter.search)}%`));
    }

    const where = and(...conditions);

    const [reviews, totals] = await Promise.all([
      this.dbService.db
        .select(REVIEW_COLUMNS)
        .from(schema.reviews)
        // Newest reviewed first. `id` breaks ties — it is a uuidv7, so it sorts by creation time
        // rather than arbitrarily, which keeps pagination stable when several reviews share a
        // timestamp (routine after a backfill, where whole pages can land in the same second).
        .orderBy(desc(schema.reviews.reviewedAt), desc(schema.reviews.id))
        .where(where)
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.dbService.db.select({ value: count() }).from(schema.reviews).where(where),
    ]);

    // Drizzle infers these pgEnum-backed columns as their own plain string-literal unions, not
    // the app-level enums — this repository is the one place that boundary gets bridged, since
    // the literal values are guaranteed identical to what the migration/enum both declare.
    return { reviews: reviews as ReviewRow[], total: totals[0]?.value ?? 0 };
  }

  async findReviewByIdForTenant(reviewId: string, tenantId: string): Promise<ReviewRow | null> {
    const rows = await this.dbService.db
      .select(REVIEW_COLUMNS)
      .from(schema.reviews)
      .where(and(eq(schema.reviews.id, reviewId), eq(schema.reviews.tenantId, tenantId)))
      .limit(1);

    return (rows[0] as ReviewRow | undefined) ?? null;
  }

  /**
   * Every response for a set of reviews, in one query rather than one per review — the list
   * endpoint needs `latestResponse` for a whole page, and a per-row query would make rendering a
   * 20-item queue 21 round trips.
   */
  async findResponsesForReviews(reviewIds: string[]): Promise<ReviewResponseRow[]> {
    if (reviewIds.length === 0) {
      return [];
    }

    return (
      this.dbService.db
        .select(RESPONSE_COLUMNS)
        .from(schema.reviewResponses)
        .where(inArray(schema.reviewResponses.reviewId, reviewIds))
        // created_at then id: id is a uuidv7 and so breaks ties in generation order rather than
        // arbitrarily. That ordering is what makes the derived "Snippet A"/"Snippet B" label stable
        // across clients instead of depending on the order each one happened to receive rows in.
        .orderBy(asc(schema.reviewResponses.createdAt), asc(schema.reviewResponses.id)) as Promise<
        ReviewResponseRow[]
      >
    );
  }
}
