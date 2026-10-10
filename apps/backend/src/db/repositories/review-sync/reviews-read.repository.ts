import { ResponseSource } from '@common/enums/response-source.enum';
import { escapeLikePattern } from '@common/helpers/like-pattern.utils';
import { DBService } from '@db/db.service';
import * as schema from '@db/drizzle/schema';
import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type {
  FindResponseForTenantInput,
  FindResponsesForReviewsInput,
  FindReviewByIdForTenantInput,
  GetPromptVersionStatsBatchInput,
  GetPromptVersionStatsInput,
  ListReviewsFilter,
  PromptVersionStatsBatchRow,
  PromptVersionStatsRow,
  ReviewResponseRow,
  ReviewRow,
} from './types/review-sync.type';

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
  rejectedByUserId: schema.reviewResponses.rejectedByUserId,
  createdAt: schema.reviewResponses.createdAt,
  decidedAt: schema.reviewResponses.decidedAt,
  postedAt: schema.reviewResponses.postedAt,
  errorMessage: schema.reviewResponses.errorMessage,
  // `generation_metadata` is deliberately absent: internal debugging data, not user-facing.
} as const;

// `posted`/`post_failed` count as approved: both were human-approved first (a post failure is
// Google's, not the owner declining), and counting only 'approved' would deflate every approval
// rate. `draft` folds into pending. Shared so the two stats methods can't define "approved" differently.
const APPROVED_RESPONSE_STATUS_FILTER = sql`${schema.reviewResponses.status} in ('approved', 'posted', 'post_failed')`;

// `coalesce` because `original_content` is nullable with no backfill: a bare `<>` against NULL
// yields NULL and would drop legacy rows from both sides of the edited/as-is split, breaking
// `approvedAsIsCount + approvedEditedCount = approvedCount`.
const CONTENT_UNCHANGED_FILTER = sql`btrim(coalesce(${schema.reviewResponses.originalContent}, ${schema.reviewResponses.content})) = btrim(${schema.reviewResponses.content})`;

/** Filler for a (promptId, version) pair whose `GROUP BY` produced no row. */
const ZERO_PROMPT_VERSION_STATS: PromptVersionStatsRow = {
  totalGenerated: 0,
  approvedCount: 0,
  approvedEditedCount: 0,
  rejectedCount: 0,
  pendingCount: 0,
  supersededCount: 0,
  averageDecisionMinutes: null,
};

function promptStatsBatchKey(promptId: string, version: number): string {
  return `${promptId}:${version}`;
}

/** Read-only half of the review tables; `ReviewSyncRepository` owns every write (split by direction so one domain still owns each table). */
@Injectable()
export class ReviewsReadRepository {
  constructor(private readonly dbService: DBService) {}

  async listReviews(filter: ListReviewsFilter): Promise<{ reviews: ReviewRow[]; total: number }> {
    // Reviews of a location paused for exceeding the plan's cap (`billing_paused_at`) are excluded
    // from both the list and the individual lookup, so a downgraded tenant can't keep browsing a
    // location it no longer pays for. A no-op for tenants with nothing paused.
    const conditions = [
      eq(schema.reviews.tenantId, filter.tenantId),
      isNull(schema.locations.billingPausedAt),
    ];

    if (filter.status) {
      conditions.push(eq(schema.reviews.status, filter.status));
    }
    if (filter.classification) {
      conditions.push(eq(schema.reviews.classification, filter.classification));
    }
    if (filter.locationId) {
      // Not validated against the tenant's own locations: the tenantId condition already scopes the
      // result, and a 403 would confirm a foreign id exists.
      conditions.push(eq(schema.reviews.locationId, filter.locationId));
    }
    if (filter.search) {
      // Reviewer name only. Anonymized rows have a NULL name and never match, which is intended.
      // `escapeLikePattern` keeps this a literal substring match (Postgres's default `\` escape).
      conditions.push(ilike(schema.reviews.reviewerName, `%${escapeLikePattern(filter.search)}%`));
    }

    const where = and(...conditions);
    // `reviews.location_id` is NOT NULL, so the inner join never drops a review `where` matched.
    const locationJoin = eq(schema.reviews.locationId, schema.locations.id);

    const [reviews, totals] = await Promise.all([
      this.dbService.db
        .select(REVIEW_COLUMNS)
        .from(schema.reviews)
        .innerJoin(schema.locations, locationJoin)
        // `id` (a uuidv7) breaks ties so pagination stays stable when many reviews share a
        // timestamp, as after a backfill.
        .orderBy(desc(schema.reviews.reviewedAt), desc(schema.reviews.id))
        .where(where)
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.dbService.db
        .select({ value: count() })
        .from(schema.reviews)
        .innerJoin(schema.locations, locationJoin)
        .where(where),
    ]);

    // Drizzle infers pgEnum columns as plain string unions, not the app enums; the values are identical.
    return { reviews: reviews as ReviewRow[], total: totals[0]?.value ?? 0 };
  }

  /** Same `billing_paused_at` exclusion as `listReviews`; a paused location's review resolves like "doesn't exist" so it doesn't leak. */
  async findReviewByIdForTenant(input: FindReviewByIdForTenantInput): Promise<ReviewRow | null> {
    const rows = await this.dbService.db
      .select(REVIEW_COLUMNS)
      .from(schema.reviews)
      .innerJoin(schema.locations, eq(schema.reviews.locationId, schema.locations.id))
      .where(
        and(
          eq(schema.reviews.id, input.reviewId),
          eq(schema.reviews.tenantId, input.tenantId),
          isNull(schema.locations.billingPausedAt)
        )
      )
      .limit(1);

    return (rows[0] as ReviewRow | undefined) ?? null;
  }

  /**
   * One query for a whole page rather than one per review. Scoped by `tenantId` even though callers
   * already resolved `reviewIds` tenant-scoped, so it stays safe if a future caller passes an
   * attacker-supplied review id.
   */
  async findResponsesForReviews(input: FindResponsesForReviewsInput): Promise<ReviewResponseRow[]> {
    if (input.reviewIds.length === 0) {
      return [];
    }

    return (
      this.dbService.db
        .select(RESPONSE_COLUMNS)
        .from(schema.reviewResponses)
        .where(
          and(
            inArray(schema.reviewResponses.reviewId, input.reviewIds),
            eq(schema.reviewResponses.tenantId, input.tenantId)
          )
        )
        // `id` (a uuidv7) breaks ties in generation order, keeping the derived "Snippet A"/"Snippet B"
        // labels stable across clients.
        .orderBy(asc(schema.reviewResponses.createdAt), asc(schema.reviewResponses.id)) as Promise<
        ReviewResponseRow[]
      >
    );
  }

  /** The pre-check that tells "doesn't exist" (404) from "not in a decidable state" (409), which the CAS update alone can't. */
  async findResponseForTenant(
    input: FindResponseForTenantInput
  ): Promise<ReviewResponseRow | null> {
    const rows = await this.dbService.db
      .select(RESPONSE_COLUMNS)
      .from(schema.reviewResponses)
      .where(
        and(
          eq(schema.reviewResponses.id, input.responseId),
          eq(schema.reviewResponses.reviewId, input.reviewId),
          eq(schema.reviewResponses.tenantId, input.tenantId)
        )
      )
      .limit(1);

    return (rows[0] as ReviewResponseRow | undefined) ?? null;
  }

  /**
   * One definition shared by both stats methods so they can't drift on "approved" or "edited".
   * `averageDecisionMinutes` only averages decided drafts; an undecided one would drag it toward zero.
   */
  private statsAggregateSelection(): {
    totalGenerated: SQL<number>;
    approvedCount: SQL<number>;
    approvedEditedCount: SQL<number>;
    rejectedCount: SQL<number>;
    pendingCount: SQL<number>;
    supersededCount: SQL<number>;
    averageDecisionMinutes: SQL<number | null>;
  } {
    return {
      // `count(reviewResponses.id)`, not `count(*)`: `getPromptVersionStats` LEFT JOINs, so an empty
      // version yields one NULL-padded row that `count(*)` would count as 1.
      totalGenerated: count(schema.reviewResponses.id),
      approvedCount: sql`count(*) filter (where ${APPROVED_RESPONSE_STATUS_FILTER})`.mapWith(
        Number
      ),
      approvedEditedCount:
        sql`count(*) filter (where ${APPROVED_RESPONSE_STATUS_FILTER} and not (${CONTENT_UNCHANGED_FILTER}))`.mapWith(
          Number
        ),
      rejectedCount:
        sql`count(*) filter (where ${schema.reviewResponses.status} = 'rejected')`.mapWith(Number),
      pendingCount:
        sql`count(*) filter (where ${schema.reviewResponses.status} in ('draft', 'pending_approval'))`.mapWith(
          Number
        ),
      supersededCount:
        sql`count(*) filter (where ${schema.reviewResponses.status} = 'superseded')`.mapWith(
          Number
        ),
      // Rounded in SQL because `numeric` arrives as a string and must be rounded before `.mapWith`.
      // `FILTER` must attach directly to the bare `avg(...)`; Postgres rejects it after `round(...)`.
      averageDecisionMinutes:
        sql`round((avg(extract(epoch from (${schema.reviewResponses.decidedAt} - ${schema.reviewResponses.createdAt})) / 60) filter (where ${schema.reviewResponses.decidedAt} is not null))::numeric, 2)`.mapWith(
          (value: unknown) => (value === null ? null : Number(value))
        ),
    };
  }

  /**
   * `null` means the prompt/version doesn't exist (the caller 404s); an all-zero row means it
   * exists with nothing generated.
   *
   * Anchored `FROM prompt_versions`/`prompts` with `review_responses` LEFT JOINed, so the row count
   * carries existence: a bare aggregate over zero rows still returns one all-zero row, which an
   * INNER JOIN from `review_responses` could not tell apart from "doesn't exist". The tenant/source
   * scoping of `review_responses` must live in the join's `ON`, not `WHERE`, which would discard
   * the NULL-padded rows and turn the LEFT JOIN back into an INNER JOIN.
   */
  async getPromptVersionStats(
    input: GetPromptVersionStatsInput
  ): Promise<PromptVersionStatsRow | null> {
    // Defensive: `imported`/`human_manual` rows leave `prompt_version_id` NULL already; stating it
    // keeps a future write path that stamps it onto a manual reply from polluting these stats.
    const responsesJoinCondition = and(
      eq(schema.reviewResponses.promptVersionId, schema.promptVersions.id),
      eq(schema.reviewResponses.tenantId, input.tenantId),
      sql`${schema.reviewResponses.source} in ('ai_generated', 'human_edited')`
    );

    if (input.version !== undefined) {
      // Anchor on that `prompt_versions` row (via `prompts` for the tenant check) so one row survives if it exists.
      const rows = await this.dbService.db
        .select(this.statsAggregateSelection())
        .from(schema.promptVersions)
        .innerJoin(schema.prompts, eq(schema.promptVersions.promptId, schema.prompts.id))
        .leftJoin(schema.reviewResponses, responsesJoinCondition)
        .where(
          and(
            eq(schema.prompts.id, input.promptId),
            eq(schema.prompts.tenantId, input.tenantId),
            eq(schema.promptVersions.version, input.version)
          )
        )
        .groupBy(schema.promptVersions.id);

      return rows[0] ?? null;
    }

    // No version: anchor on `prompts` (aggregating all versions) so a prompt with none yet returns all zeros, not null.
    const rows = await this.dbService.db
      .select(this.statsAggregateSelection())
      .from(schema.prompts)
      .leftJoin(schema.promptVersions, eq(schema.promptVersions.promptId, schema.prompts.id))
      .leftJoin(schema.reviewResponses, responsesJoinCondition)
      .where(
        and(eq(schema.prompts.id, input.promptId), eq(schema.prompts.tenantId, input.tenantId))
      )
      .groupBy(schema.prompts.id);

    return rows[0] ?? null;
  }

  /**
   * `getPromptVersionStats` for many (promptId, version) pairs in one round trip. Grouping by the
   * primary key lets Postgres project `prompt_id`/`version` by functional dependency. Unlike the
   * single-pair bare aggregate, a pair with no responses yields no group, so it is filled with
   * `ZERO_PROMPT_VERSION_STATS`. Results follow `input.pairs` order, duplicates included.
   */
  async getPromptVersionStatsBatch(
    input: GetPromptVersionStatsBatchInput
  ): Promise<PromptVersionStatsBatchRow[]> {
    if (input.pairs.length === 0) {
      return [];
    }

    const pairConditions = input.pairs.map(pair =>
      and(
        eq(schema.promptVersions.promptId, pair.promptId),
        eq(schema.promptVersions.version, pair.version)
      )
    );

    const rows = await this.dbService.db
      .select({
        promptId: schema.promptVersions.promptId,
        version: schema.promptVersions.version,
        ...this.statsAggregateSelection(),
      })
      .from(schema.reviewResponses)
      .innerJoin(
        schema.promptVersions,
        eq(schema.reviewResponses.promptVersionId, schema.promptVersions.id)
      )
      .where(
        and(
          eq(schema.reviewResponses.tenantId, input.tenantId),
          or(...pairConditions),
          sql`${schema.reviewResponses.source} in ('ai_generated', 'human_edited')`
        )
      )
      .groupBy(
        schema.promptVersions.id,
        schema.promptVersions.promptId,
        schema.promptVersions.version
      );

    const statsByPair = new Map<string, PromptVersionStatsRow>();
    for (const row of rows) {
      statsByPair.set(promptStatsBatchKey(row.promptId, row.version), {
        totalGenerated: row.totalGenerated,
        approvedCount: row.approvedCount,
        approvedEditedCount: row.approvedEditedCount,
        rejectedCount: row.rejectedCount,
        pendingCount: row.pendingCount,
        supersededCount: row.supersededCount,
        averageDecisionMinutes: row.averageDecisionMinutes,
      });
    }

    return input.pairs.map(pair => ({
      promptId: pair.promptId,
      version: pair.version,
      stats:
        statsByPair.get(promptStatsBatchKey(pair.promptId, pair.version)) ??
        ZERO_PROMPT_VERSION_STATS,
    }));
  }

  /** Usage counter for the plan's monthly AI-draft limit: AI-generated responses since the start of the current UTC month. */
  async countAiGeneratedResponsesThisMonth(tenantId: string, monthStart: string): Promise<number> {
    const rows = await this.dbService.db
      .select({ value: count() })
      .from(schema.reviewResponses)
      .where(
        and(
          eq(schema.reviewResponses.tenantId, tenantId),
          eq(schema.reviewResponses.source, ResponseSource.AI_GENERATED),
          gte(schema.reviewResponses.createdAt, monthStart)
        )
      );

    return rows[0]?.value ?? 0;
  }
}
