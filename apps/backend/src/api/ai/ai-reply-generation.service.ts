import { AiDraftLimitReachedException } from '@billing/exceptions/billing.exceptions';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { PromptsDbService } from '@db/repositories/prompts/prompts.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { GenerationCandidateRow } from '@db/repositories/review-sync/review-sync.repository';
import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_PROMPT_TONE } from '@prompts/constants/default-prompts.constant';
import { sanitizePromptTemplate } from '@prompts/constants/prompts.constants';
import type {
  CurrentPromptForCategory,
  PromptCategory,
  PromptTone,
} from '@prompts/types/prompt.type';

import { randomUUID } from 'crypto';

import {
  FALLBACK_BUSINESS_NAME,
  GENERATION_BATCH_LIMIT,
  MAX_CONSECUTIVE_GENERATION_FAILURES,
} from './constants/ai.constants';
import {
  AiPromptNotConfiguredException,
  AiProviderNotConfiguredException,
} from './exceptions/ai.exceptions';
import { AiProvider } from './providers/ai.provider';
import type {
  GeneratedReply,
  GenerateDryRunReplyInput,
  GenerateForClassifiedReviewsInput,
  GenerationBatchResult,
} from './types/ai-reply-generation.type';
import { resolvePromptCategoryForReview } from './utils/prompt-category-for-review.util';
import { buildSystemPrompt, fillPromptTemplate } from './utils/prompt-template.util';

/**
 * The business-logic entrypoint for this module — everything else here (the provider, the
 * template filler) is plumbing this composes. Two public methods, deliberately kept apart rather
 * than one method with a "persist or not" flag:
 *
 * - `generateDryRunReply` fills a real tenant's real prompt template with a **caller-supplied
 *   mock review** and never touches `review_responses` — for testing prompt/tone configuration
 *   and the AI provider itself, safe to call freely since nothing it does is persisted.
 * - `generateForClassifiedReviews` is PLAN.md §5's actual generation step: it reads **real**
 *   reviews `ReviewClassificationService` already routed to `auto_reply_candidate`/`escalated`,
 *   generates a reply for each, and persists it as a `pending_approval` `review_responses` row —
 *   called from `ReviewSyncQueueService.classifyImportedReviews`, right after classification, in
 *   the same 15-minute poll tick (no separate cron; see the module doc's own reasoning for why
 *   generation is a peer step in that pipeline, not a schedule of its own).
 *
 * `BillingEntitlementsService.canGenerateAiDraft`'s usage count (which counts *persisted*
 * `source = 'ai_generated'` rows) is checked by both, but only the second one can ever move it —
 * a dry run never persists anything, so it can safely share the same check without a second,
 * ungoverned quota.
 *
 * **Deliberately simplified against PLAN.md §5's literal wording, on two points**, both flagged
 * here rather than silently matched:
 *  1. §5 asks for ~50 posted `review_responses` rows as few-shot examples in the prompt. Not
 *     implemented — there is no reader anywhere yet of the historical replies backfill already
 *     imports (`ReviewSyncQueueService`'s own `IMPORTED_REPLY_TARGET`), and adding one is a real,
 *     separate change (a second provider round trip's worth of context, prompt-length budgeting)
 *     worth its own pass, not bundled into wiring generation up for the first time.
 *  2. §5 asks for 2-3 `escalation_snippet` rows sharing one `generation_group_id` per escalated
 *     review. This generates exactly one. `generateReplyForCandidate`'s own doc comment covers
 *     why an escalated review still gets a `generation_group_id` today even though only one
 *     snippet is ever in "the group" — the schema is ready for the real multi-snippet version
 *     without a migration; only the loop that would call the provider 2-3 times is deferred.
 */
@Injectable()
export class AiReplyGenerationService {
  private readonly logger = new Logger(AiReplyGenerationService.name);

  constructor(
    private readonly aiProvider: AiProvider,
    private readonly promptsDbService: PromptsDbService,
    private readonly authDbService: AuthDbService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly reviewSyncDbService: ReviewSyncDbService
  ) {}

  /**
   * Takes a `tenantId` rather than the `AuthUser` it used to, because a tenant id is this
   * method's actual dependency — everything below reads prompts, a business name and a billing
   * quota by it, and nothing needs the rest of the principal. Narrowing `AuthUser` to a tenant
   * user stays with whichever controller has one (`AiController`); the dev-only public controller
   * has no principal at all and resolves its tenant differently, which is only expressible if the
   * service asks for what it genuinely uses.
   */
  async generateDryRunReply(
    input: GenerateDryRunReplyInput,
    tenantId: string
  ): Promise<GeneratedReply> {
    // Checked even in dry-run mode, deliberately — see this class's own doc comment for why that
    // doesn't create a second, ungoverned quota: nothing below this line ever persists a row that
    // would count against it.
    if (!(await this.billingEntitlementsService.canGenerateAiDraft(tenantId))) {
      throw new AiDraftLimitReachedException();
    }

    // Independent reads — neither depends on the other's result — run concurrently rather than
    // paying the sum of both round trips before the (much slower, 30s-timeout-bound) AI call.
    const [{ template, tone, usedTemplateOverride }, businessName] = await Promise.all([
      this.resolveTemplateAndTone(tenantId, input),
      this.resolveBusinessName(tenantId),
    ]);

    const userPrompt = fillPromptTemplate(template, {
      business_name: businessName,
      reviewer_name: input.review.reviewerName,
      rating: String(input.review.rating),
      review_text: input.review.reviewText,
    });
    const systemPrompt = buildSystemPrompt(tone);

    const result = await this.aiProvider.generateReply({ systemPrompt, userPrompt });

    return { ...result, category: input.category, tone, usedTemplateOverride };
  }

  /** `templateOverride` lets a caller test raw prompt text (a draft not yet saved as a real
   *  prompt version, or a quick "what if the wording were X" check) without first going through
   *  `PromptsService.createVersion` — purely a dry-run convenience, since nothing here persists a
   *  version either way.
   *
   *  Tone is resolved from the tenant's saved prompt **regardless of which template is used** —
   *  `current` is looked up unconditionally, not only in the "use the saved template" branch.
   *  Testing a draft template with `templateOverride` is meant to preview it in the tenant's own
   *  configured tone, not silently reset to the platform default the moment a caller omits
   *  `toneOverride`; only when this tenant has literally no prompt row at all for the category
   *  (an anomaly `findCurrentForCategory`'s own doc comment already calls out) does the override
   *  branch fall back to `DEFAULT_PROMPT_TONE`, so a dry run of ad-hoc text never hard-fails on a
   *  data-integrity gap the way the non-override branch below correctly does. */
  private async resolveTemplateAndTone(
    tenantId: string,
    input: GenerateDryRunReplyInput
  ): Promise<{ template: string; tone: PromptTone; usedTemplateOverride: boolean }> {
    const current: CurrentPromptForCategory | null =
      await this.promptsDbService.findCurrentForCategory(tenantId, input.category);

    if (input.templateOverride !== undefined) {
      return {
        template: sanitizePromptTemplate(input.templateOverride).trim(),
        tone: input.toneOverride ?? current?.tone ?? DEFAULT_PROMPT_TONE,
        usedTemplateOverride: true,
      };
    }

    if (current === null) {
      throw new AiPromptNotConfiguredException();
    }

    return {
      template: current.template,
      tone: input.toneOverride ?? current.tone,
      usedTemplateOverride: false,
    };
  }

  /** Same-shaped fallback as `BillingService.downloadReceiptPdf`'s ("a tenant with no name on
   *  record falls back to something else rather than failing the whole operation"), but *not*
   *  the same fallback value — that one falls back to the requesting user's own email, which is
   *  fine for a PDF only that same user ever downloads. This method's result is woven into
   *  `{{business_name}}` inside AI-generated text meant to become a **public** review reply, so
   *  the fallback is `FALLBACK_BUSINESS_NAME` (a generic phrase), never PII. See that constant's
   *  own doc comment. */
  private async resolveBusinessName(tenantId: string): Promise<string> {
    const tenant = await this.authDbService.findTenantStatus(tenantId);
    return tenant?.name ?? FALLBACK_BUSINESS_NAME;
  }

  /**
   * PLAN.md §5, wired into the real pipeline: for every review this tenant+location already has
   * sitting at `status = 'new'` with a live `classification` (`ReviewSyncQueueService`'s own
   * `classifyImportedReviews` calls this right after classification, in the same poll tick),
   * generates a reply and persists it as a `pending_approval` `review_responses` row.
   *
   * Claimed before generating, never after — `claimForGeneration`'s CAS reserves one specific
   * review before its AI call even starts, closing the double-generation race the same way
   * `claimClassification` closes double-classification (see that repository method's own doc
   * comment for the other half of that guarantee).
   *
   * **The quota is a budget, not a gate.** `canGenerateAiDraft` answers "may this tenant generate
   * at all", which is not the same question as "how many more may it generate" — asking only the
   * boolean and then fetching a full `GENERATION_BATCH_LIMIT` batch lets a tenant one draft below
   * its cap produce a whole batch beyond it (19 used of 20 → 39 generated, every one a billable
   * call). So the remaining allowance is computed up front and *clamps the batch size*.
   *
   * One residual, deliberately not solved here: the count behind that allowance is a plain
   * `SELECT count(*)` with no reservation, so two jobs for the same tenant on different locations
   * could each read the same remaining budget and each spend it. Not reachable today — the only
   * plan with a finite draft cap (Free) also caps `max_locations` at 1 — and closing it properly
   * needs a tenant-wide lock across the generation step, which belongs with PLAN.md §8's own
   * race-handling pass rather than bolted on here.
   *
   * Never throws for a single bad candidate — an AI-call or persistence failure is caught,
   * logged, and its claim released so the next tick retries it, exactly the same per-item
   * isolation `ReviewClassificationService.classifyPendingReviews` already uses for the same
   * reason (one malformed review must not take an entire batch down with it). A failure that
   * happens *before* the loop (the entitlement read or the candidate query itself) is allowed to
   * propagate — `ReviewSyncQueueService`'s own wrapper is what catches that, the same shape it
   * already uses around `classifyPendingReviews`.
   */
  async generateForClassifiedReviews(
    input: GenerateForClassifiedReviewsInput
  ): Promise<GenerationBatchResult> {
    // Before the quota check, not after: reclaiming is pure cleanup (one UPDATE, generates
    // nothing, spends nothing) with no reason to sit behind a spend gate. A tenant already at its
    // monthly cap still needs a review a dead worker stranded at `in_review` handed back to
    // `new` — otherwise it stays invisible to every later tick's `status = 'new'`-only query
    // until the cap resets next calendar month, even though recovering it costs the quota
    // nothing. Same reclaim-then-proceed ordering as `acquireSyncRun`'s own stale-run handling.
    const reclaimed = await this.reviewSyncDbService.reclaimStaleGenerationClaims(input.locationId);
    if (reclaimed > 0) {
      this.logger.warn(
        `Reclaimed ${reclaimed} stale generation claim(s) for location ${input.locationId} — reviews left at 'in_review' with no draft, most likely by a worker that died mid-batch.`
      );
    }

    const entitlements = await this.billingEntitlementsService.getEntitlements(input.tenantId);
    const remainingQuota =
      entitlements.maxAiDraftsPerMonth === null
        ? Number.POSITIVE_INFINITY
        : entitlements.maxAiDraftsPerMonth - entitlements.aiDraftsUsedThisMonth;

    if (remainingQuota <= 0) {
      // `debug`, not `warn`: for a tenant that has capped out, this is the steady state for the
      // rest of the calendar month, firing once per location per 15-minute tick — thousands of
      // identical lines describing a working limit, which is noise, not a signal.
      this.logger.debug(
        `AI-draft monthly limit reached for tenant ${input.tenantId} — skipping generation for location ${input.locationId} until it resets.`
      );
      return { generated: 0, skipped: 0, failed: 0, quotaReached: true };
    }

    const batchLimit = Math.min(GENERATION_BATCH_LIMIT, remainingQuota);
    const candidates = await this.reviewSyncDbService.findClassifiedNeedingGeneration(
      input.tenantId,
      input.locationId,
      batchLimit
    );

    if (candidates.length === 0) {
      return { generated: 0, skipped: 0, failed: 0, quotaReached: false };
    }

    // Deliberately not fatal — see GENERATION_BATCH_LIMIT's own doc comment for why the
    // remainder is simply this tenant+location's problem on the *next* tick, not this one's.
    if (candidates.length === batchLimit) {
      this.logger.log(
        `Generation for location ${input.locationId} filled its ${batchLimit}-review batch (limit: ${
          batchLimit === GENERATION_BATCH_LIMIT ? 'per-tick cap' : 'remaining monthly quota'
        }); anything beyond it stays 'new' for the next tick.`
      );
    }

    // Read once for the whole batch, not once per review — every candidate here belongs to the
    // same tenant, so this would otherwise be the exact same redundant-sequential-read shape a
    // review of this module's dry-run path already flagged and fixed once.
    const businessName = await this.resolveBusinessName(input.tenantId);
    // At most 3 entries (`PromptCategory` has exactly three values) for a batch that can be up
    // to `GENERATION_BATCH_LIMIT` reviews long — the same reasoning as `businessName` above, just
    // per-category instead of tenant-wide. `undefined` (not yet asked) is distinct from `null`
    // (asked, no prompt exists for that category) so a confirmed-missing category is cached too,
    // not re-queried on every review that happens to need it.
    const promptCache = new Map<PromptCategory, CurrentPromptForCategory | null>();

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    let consecutiveFailures = 0;

    for (const candidate of candidates) {
      const claimed = await this.reviewSyncDbService.claimForGeneration(candidate.id);
      if (!claimed) {
        skipped += 1;
        this.logger.warn(
          `Review ${candidate.id} stopped being a generation candidate before it could be claimed (already generated for, or no longer 'new'); skipping.`
        );
        continue;
      }

      try {
        await this.generateAndPersistForCandidate(
          input.tenantId,
          candidate,
          businessName,
          promptCache
        );
        generated += 1;
        consecutiveFailures = 0;
      } catch (error) {
        failed += 1;
        consecutiveFailures += 1;
        this.logger.error(
          `Generation failed for review ${candidate.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );

        // Wrapped in its own try/catch, and not allowed to escape. An unguarded `await` here
        // would turn one item's failure into the whole batch's — and it rejects precisely when
        // things are already degraded (pool exhaustion, statement timeout), which is exactly
        // when abandoning the remaining candidates is worst. The row it failed to release is
        // then a stale claim, which `reclaimStaleGenerationClaims` above already sweeps.
        try {
          await this.reviewSyncDbService.releaseGenerationClaim(candidate.id);
        } catch (releaseError) {
          this.logger.error(
            `Could not release the generation claim on review ${candidate.id}; it will be swept as a stale claim in ${'~30 minutes'}: ${
              releaseError instanceof Error ? releaseError.message : String(releaseError)
            }`
          );
        }

        // Stop the batch when the next attempt is certain to fail the same way. Without this, a
        // missing API key or a provider outage costs a claim + a 30s timeout + a release for
        // every remaining candidate — up to ten minutes of a job tick spent failing, every 15
        // minutes, on a poll whose own run is reclaimed as stale after thirty.
        if (error instanceof AiProviderNotConfiguredException) {
          this.logger.error(
            `AI provider is not configured — abandoning the remaining ${
              candidates.length - (generated + skipped + failed)
            } candidate(s) for location ${input.locationId} rather than failing each one identically.`
          );
          break;
        }
        if (consecutiveFailures >= MAX_CONSECUTIVE_GENERATION_FAILURES) {
          this.logger.error(
            `${consecutiveFailures} generation failures in a row for location ${input.locationId} — treating the provider as unavailable and abandoning the rest of this batch; the next tick retries.`
          );
          break;
        }
      }
    }

    this.logger.log(
      `Generated ${generated}/${candidates.length} drafts for location ${input.locationId} (${skipped} skipped, ${failed} failed).`
    );

    return { generated, skipped, failed, quotaReached: false };
  }

  /**
   * One already-claimed review, drafted and persisted. `generation_group_id` is assigned for
   * every `ESCALATION_SNIPPET` row here — not only once there's more than one snippet in it — so
   * the column already means the same thing it will once PLAN.md §5's full 2-3-snippet version
   * lands: "the group this row belongs to," a group of one being a perfectly valid group. That
   * makes the eventual upgrade a change to how many times this method's provider call runs, not a
   * schema migration or a backfill of existing rows.
   *
   * `reviewerName`/`reviewText` fall back to a generic phrase rather than an empty string:
   * Google allows a star-rating-only review with neither field set, and an empty substitution
   * would read as broken grammar ("review from .") in a template that assumes both are present.
   */
  private async generateAndPersistForCandidate(
    tenantId: string,
    candidate: GenerationCandidateRow,
    businessName: string,
    promptCache: Map<PromptCategory, CurrentPromptForCategory | null>
  ): Promise<void> {
    const category = resolvePromptCategoryForReview(candidate);

    let current = promptCache.get(category);
    if (current === undefined) {
      current = await this.promptsDbService.findCurrentForCategory(tenantId, category);
      promptCache.set(category, current);
    }
    if (current === null) {
      throw new AiPromptNotConfiguredException();
    }

    const userPrompt = fillPromptTemplate(current.template, {
      business_name: businessName,
      reviewer_name: candidate.reviewerName ?? 'a reviewer',
      rating: String(candidate.rating),
      review_text: candidate.reviewText ?? '(no written comment — rating only)',
    });
    const systemPrompt = buildSystemPrompt(current.tone);

    const result = await this.aiProvider.generateReply({ systemPrompt, userPrompt });

    const isEscalated = candidate.classification === ReviewClassification.ESCALATED;
    await this.reviewSyncDbService.insertGeneratedResponse({
      tenantId,
      reviewId: candidate.id,
      responseType: isEscalated
        ? ResponseType.ESCALATION_SNIPPET
        : ResponseType.AUTO_REPLY_SUGGESTION,
      content: result.content,
      generationGroupId: isEscalated ? randomUUID() : null,
      generationMetadata: {
        model: result.model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: result.latencyMs,
        finishReason: result.finishReason,
        category,
        tone: current.tone,
      },
    });
  }
}
