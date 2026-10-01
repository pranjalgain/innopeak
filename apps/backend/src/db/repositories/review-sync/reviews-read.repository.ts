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
  // `generation_metadata` is deliberately absent: it holds model name, region and token counts
  // for server-side debugging and is not user-facing.
} as const;

// `posted`/`post_failed` count as approved — a posted reply *was* approved by a human first, and
// a post_failed one was too (the failure was Google's API, not the owner declining it). Counting
// only literal 'approved' would drop exactly the drafts that succeeded most and silently deflate
// every approval rate. `draft` folds into pending for the same reason: both mean "no human has
// decided yet". Shared (rather than declared per-method) so `getPromptVersionStats` and
// `getPromptVersionStatsBatch` can't drift into two definitions of "approved".
const APPROVED_RESPONSE_STATUS_FILTER = sql`${schema.reviewResponses.status} in ('approved', 'posted', 'post_failed')`;

// `btrim(coalesce(original_content, content))` rather than a bare `content <> original_content` —
// `original_content` is nullable with no backfill, so a bare `<>` against NULL evaluates to NULL
// (excluded by FILTER) and silently drops every legacy row from both sides of the edited/as-is
// split. Coalescing treats a null original as "nothing to compare, so unedited", which keeps
// `approvedAsIsCount + approvedEditedCount = approvedCount` — the invariant the frontend's
// edited-rate percentage depends on.
const CONTENT_UNCHANGED_FILTER = sql`btrim(coalesce(${schema.reviewResponses.originalContent}, ${schema.reviewResponses.content})) = btrim(${schema.reviewResponses.content})`;

/** What "this pair has no drafts yet" looks like, for `getPromptVersionStatsBatch`: a
 *  (promptId, version) pair whose `GROUP BY` produced no row at all (no matching review_responses)
 *  is filled in with this literal shape rather than left missing. */
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
    // A location this tenant has downgraded past its plan's cap is paused (`billing_paused_at`
    // set — see `BillingEntitlementsService.enforceLocationLimitOnDowngrade`), and its reviews are
    // excluded from both the list and the individual lookup below. Unconditional, not
    // plan-gated: `billing_paused_at` is only ever non-null when a location is genuinely over cap
    // (Paid clears it on every location, see `clearBillingPauseForTenant`), so this is a no-op for
    // any tenant with nothing paused. Without it, a downgraded tenant could keep browsing full
    // review history — including replies — for a location they no longer pay for, which defeats
    // the location cap's entire purpose; the "choose your active location" flow's whole premise is
    // that the excess location's data isn't part of what the current plan includes.
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
    // Every location row exists and `reviews.location_id` is `NOT NULL` (see `0004_reviews.sql`),
    // so an inner join never drops a review that would otherwise have matched `where` on its own.
    const locationJoin = eq(schema.reviews.locationId, schema.locations.id);

    const [reviews, totals] = await Promise.all([
      this.dbService.db
        .select(REVIEW_COLUMNS)
        .from(schema.reviews)
        .innerJoin(schema.locations, locationJoin)
        // Newest reviewed first. `id` breaks ties — it is a uuidv7, so it sorts by creation time
        // rather than arbitrarily, which keeps pagination stable when several reviews share a
        // timestamp (routine after a backfill, where whole pages can land in the same second).
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

    // Drizzle infers these pgEnum-backed columns as their own plain string-literal unions, not
    // the app-level enums — this repository is the one place that boundary gets bridged, since
    // the literal values are guaranteed identical to what the migration/enum both declare.
    return { reviews: reviews as ReviewRow[], total: totals[0]?.value ?? 0 };
  }

  /** Same `billing_paused_at` exclusion as `listReviews` — see that method's own comment. A review
   *  that exists but belongs to a paused (over-cap) location resolves the same as "doesn't exist",
   *  rather than leaking that it exists via a different error/status. */
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
   * Every response for a set of reviews, in one query rather than one per review — the list
   * endpoint needs `latestResponse` for a whole page, and a per-row query would make rendering a
   * 20-item queue 21 round trips.
   *
   * Scoped by `tenantId` even though every current caller already resolved `reviewIds` from a
   * tenant-scoped read: `review_responses.tenant_id` is a real column on this table, so the
   * defense costs nothing and this stops being latent (safe only because of caller discipline)
   * the moment a future write surface takes an attacker-supplied review id.
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
        // created_at then id: id is a uuidv7 and so breaks ties in generation order rather than
        // arbitrarily. That ordering is what makes the derived "Snippet A"/"Snippet B" label stable
        // across clients instead of depending on the order each one happened to receive rows in.
        .orderBy(asc(schema.reviewResponses.createdAt), asc(schema.reviewResponses.id)) as Promise<
        ReviewResponseRow[]
      >
    );
  }

  /** One response, scoped to both the review and the tenant it belongs to — the pre-check
   *  `ReviewsService.approveReply`/`rejectReply` use to tell "doesn't exist" (404) apart from
   *  "exists but isn't in a decidable state" (409), which the CAS update alone can't distinguish. */
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
   * The six per-status/decision-time aggregate expressions shared by `getPromptVersionStats` and
   * `getPromptVersionStatsBatch` — both `GROUP BY` a `prompt_versions`/`prompts` id, one row per
   * group — kept as one definition so the two never drift into different definitions of "approved"
   * or "edited". Every per-status count uses a `FILTER (WHERE ...)` clause rather than
   * N separate queries or a `CASE WHEN` sum, so the whole breakdown is one round trip.
   * `averageDecisionMinutes` is filtered to `decided_at IS NOT NULL` for the same reason
   * `computePromptVersionStats` (the frontend function this replaces) only averaged decided
   * drafts — an undecided draft has no decision time to contribute, and letting it drag the
   * average toward zero would understate how long real decisions take.
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
      // `count(reviewResponses.id)`, not the bare `count()` (`count(*)`): `getPromptVersionStats`
      // LEFT JOINs into this table so a version/prompt with zero reviews still produces one
      // NULL-padded row rather than an empty result set. `count(*)` would count that phantom row
      // as 1; counting a column that's NULL on it correctly comes out to 0. Every `FILTER`-based
      // count below already gets this for free, since each one filters on a column that's also
      // NULL on the padded row.
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
      // Rounded in SQL (2 decimal places) rather than in JS — `numeric`'s driver representation
      // is a string either way, so the rounding has to happen before `.mapWith` converts it.
      // `NULL` (no decided rows in the filter) maps straight through rather than becoming `NaN`.
      // `FILTER` has to attach directly to the bare `avg(...)` call — Postgres rejects it on
      // `round(avg(...)::numeric, 2) filter (...)`, since the expression immediately to its
      // left has to be an aggregate function call, not a scalar function wrapping one.
      averageDecisionMinutes:
        sql`round((avg(extract(epoch from (${schema.reviewResponses.decidedAt} - ${schema.reviewResponses.createdAt})) / 60) filter (where ${schema.reviewResponses.decidedAt} is not null))::numeric, 2)`.mapWith(
          (value: unknown) => (value === null ? null : Number(value))
        ),
    };
  }

  /**
   * One query that answers both "does this prompt/version exist for this tenant" and "what are its
   * stats" — `null` means it doesn't exist (the caller 404s); a row (all-zero if nothing has been
   * generated yet) means it does.
   *
   * `review_responses` is `LEFT JOIN`ed, not `INNER JOIN`ed, and anchored `FROM
   * prompt_versions`/`prompts` instead — the reverse of the obvious "start from the reviews and
   * join up" shape. That reversal is what makes ONE query answer both questions: a bare aggregate
   * with no `GROUP BY` always returns exactly one row even over zero matching input rows
   * (`count(*) = 0`, `avg(...) = NULL`), so an `INNER JOIN FROM review_responses` can't tell "this
   * version doesn't exist" apart from "it exists but has zero reviews" — both produce the same
   * single all-zero row. Anchoring on `prompt_versions`/`prompts` instead makes the ROW COUNT
   * itself carry existence: the tenant-scoped `WHERE` either matches the one version/prompt row
   * (real existence) or none at all (a genuinely empty result set), and `review_responses` rows
   * merely enrich whichever version/prompt row survives that filter. The tenant/source scoping on
   * `review_responses` has to live in the `LEFT JOIN`'s own `ON` clause, not `WHERE` — filtering a
   * `LEFT JOIN`'s matched columns in `WHERE` discards the very NULL-padded rows that make "exists
   * but empty" distinguishable from "doesn't exist" in the first place, silently turning the LEFT
   * JOIN back into an INNER JOIN.
   */
  async getPromptVersionStats(
    input: GetPromptVersionStatsInput
  ): Promise<PromptVersionStatsRow | null> {
    // Defensive rather than strictly necessary: `imported`/`human_manual` rows never went through a
    // prompt and leave `prompt_version_id` NULL, so the join already excludes them. Stating it
    // explicitly means a future write path that starts stamping `prompt_version_id` onto a
    // manually-written reply can't quietly pollute these stats.
    const responsesJoinCondition = and(
      eq(schema.reviewResponses.promptVersionId, schema.promptVersions.id),
      eq(schema.reviewResponses.tenantId, input.tenantId),
      sql`${schema.reviewResponses.source} in ('ai_generated', 'human_edited')`
    );

    if (input.version !== undefined) {
      // A specific version: anchor on that one `prompt_versions` row (via `prompts` for the
      // tenant-ownership check), grouped by its id so exactly one row survives if it exists.
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

    // No specific version: anchor on the `prompts` row itself (aggregating across every version),
    // so a prompt with no versions yet still exists and returns all-zero stats rather than null.
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
   * The same aggregate as `getPromptVersionStats`, computed for many (promptId, version) pairs in
   * one round trip instead of one request per pair — what `usePromptAnalytics` needs to render a
   * prompt list's summary strip and every card's current-version stats line without firing N
   * simultaneous requests. `GROUP BY prompt_versions.id` (rather than a separate query per pair)
   * is what makes this one query regardless of how many pairs are asked for; grouping by the
   * table's own primary key lets Postgres also project `prompt_id`/`version` straight out of the
   * same row via functional dependency, no extra join or subquery needed.
   *
   * A pair with no matching `review_responses` rows produces no group at all (GROUP BY, unlike
   * `getPromptVersionStats`'s bare aggregate, is a real empty result set for that pair) — filled
   * in as `ZERO_PROMPT_VERSION_STATS` below, so a caller never has to special-case a missing key.
   * Results come back in the same order as `input.pairs`, one entry per pair (duplicates included)
   * rather than the deduplicated set of matched groups.
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

  /**
   * `BillingEntitlementsService.canGenerateAiDraft`'s usage counter — `review_responses` rows this
   * tenant generated (`source = 'ai_generated'`) since the start of the current calendar month
   * (UTC). Live in practice: `AiReplyGenerationService.generateForClassifiedReviews` persists
   * exactly this row shape on every successful draft, wired into `ReviewSyncQueueService`'s
   * 15-minute poll tick — see that method's own doc comment.
   */
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
