import { AiDraftLimitReachedException } from '@billing/exceptions/billing.exceptions';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { PromptsDbService } from '@db/repositories/prompts/prompts.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { GenerationCandidateRow } from '@db/repositories/review-sync/types/review-sync.type';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { DEFAULT_PROMPT_TONE } from '@prompts/constants/default-prompts.constant';
import { sanitizePromptTemplate } from '@prompts/constants/prompts.constants';
import type {
  CurrentPromptForCategory,
  PromptCategory,
  PromptTone,
} from '@prompts/types/prompt.type';
import { enqueuePostOrMarkFailed } from '@review-post-queue/enqueue-post-or-mark-failed.util';
import { ReviewPostQueue } from '@review-post-queue/review-post.queue';

import { randomUUID } from 'crypto';

import {
  AI_MAX_OUTPUT_TOKENS,
  DEFAULT_AI_REPLY_COUNT,
  FALLBACK_BUSINESS_NAME,
  GENERATION_BATCH_LIMIT,
  MAX_AI_REPLY_COUNT,
  MAX_CONSECUTIVE_GENERATION_FAILURES,
} from './constants/ai.constants';
import {
  AiGenerationFailedException,
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
import {
  buildSystemPrompt,
  fillPromptTemplate,
  parseMultiSnippetReplies,
} from './utils/prompt-template.util';

/** Same index `ReviewsService.approveReply` guards; a freshly generated response can still lose this race (see `maybeAutoApproveAndPost`). */
const LIVE_REPLY_INDEX = 'idx_review_responses_review_id_live_reply';

interface BatchSettings {
  aiReplyCount: number;
  autoPostEnabled: boolean;
}

/**
 * `generateDryRunReply` never persists; `generateForClassifiedReviews` persists `pending_approval` rows right after
 * classification. Each persisted snippet, not each review, spends one unit of `maxAiDraftsPerMonth`.
 * Few-shot examples from posted replies are deliberately not implemented: nothing reads historical replies yet.
 */
@Injectable()
export class AiReplyGenerationService {
  private readonly logger = new Logger(AiReplyGenerationService.name);

  constructor(
    private readonly aiProvider: AiProvider,
    private readonly promptsDbService: PromptsDbService,
    private readonly authDbService: AuthDbService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly settingsDbService: SettingsDbService,
    private readonly reviewPostQueue: ReviewPostQueue
  ) {}

  /** Takes a tenantId, not an AuthUser, because the dev-only public controller has no principal. */
  async generateDryRunReply(
    input: GenerateDryRunReplyInput,
    tenantId: string
  ): Promise<GeneratedReply> {
    // Checked in dry-run too: safe, since nothing below persists a row that counts against the quota.
    if (!(await this.billingEntitlementsService.canGenerateAiDraft(tenantId))) {
      throw new AiDraftLimitReachedException();
    }

    // Independent reads, run concurrently to avoid paying both round trips before the slow AI call.
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

  /** `templateOverride` tests unsaved prompt text. Tone is still resolved from the tenant's saved prompt; only with
   *  no prompt row at all does the override branch fall back to `DEFAULT_PROMPT_TONE` instead of hard-failing. */
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

  /** Falls back to a generic phrase, never PII: the name lands in a public review reply. */
  private async resolveBusinessName(tenantId: string): Promise<string> {
    const tenant = await this.authDbService.findTenantStatus(tenantId);
    return tenant?.name ?? FALLBACK_BUSINESS_NAME;
  }

  /**
   * Claims each review (CAS) before its AI call to prevent double generation. The quota is a budget, not a gate: the
   * remaining allowance clamps the batch size, so a tenant one draft under its cap can't generate a full batch.
   * Residual race: the count is an unreserved SELECT, so two locations of one tenant could overspend; unreachable
   * today because the only capped plan (Free) allows one location. One bad candidate never throws (claim released).
   */
  async generateForClassifiedReviews(
    input: GenerateForClassifiedReviewsInput
  ): Promise<GenerationBatchResult> {
    // Before the quota check: reclaiming costs nothing, and a tenant at its cap must still get
    // stranded `in_review` reviews back to `new`.
    const reclaimed = await this.reviewSyncDbService.reclaimStaleGenerationClaims(input.locationId);
    if (reclaimed > 0) {
      this.logger.warn(
        `Reclaimed ${reclaimed} stale generation claim(s) for location ${input.locationId} — reviews left at 'in_review' with no draft, most likely by a worker that died mid-batch.`
      );
    }

    const entitlements = await this.billingEntitlementsService.getEntitlements(input.tenantId);
    // Running budget; an escalated candidate can spend more than 1 unit, so the batch size is only an
    // upper bound on reviews fetched and the loop re-checks this counter.
    let remainingQuota =
      entitlements.maxAiDraftsPerMonth === null
        ? Number.POSITIVE_INFINITY
        : entitlements.maxAiDraftsPerMonth - entitlements.aiDraftsUsedThisMonth;

    if (remainingQuota <= 0) {
      // `debug`, not `warn`: for a capped tenant this repeats every tick for the rest of the month.
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

    // Not fatal: the remainder is handled on the next tick.
    if (candidates.length === batchLimit) {
      this.logger.log(
        `Generation for location ${input.locationId} filled its ${batchLimit}-review batch (limit: ${
          batchLimit === GENERATION_BATCH_LIMIT ? 'per-tick cap' : 'remaining monthly quota'
        }); anything beyond it stays 'new' for the next tick.`
      );
    }

    // Read once per batch: every candidate belongs to the same tenant.
    const businessName = await this.resolveBusinessName(input.tenantId);
    // `undefined` = not yet asked, `null` = asked and no prompt exists, so a missing category is cached too.
    const promptCache = new Map<PromptCategory, CurrentPromptForCategory | null>();
    const batchSettings = await this.resolveBatchSettings(input.tenantId);

    let generated = 0;
    let reviewsHandled = 0;
    let skipped = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    let quotaExhaustedMidBatch = false;

    for (const candidate of candidates) {
      if (remainingQuota <= 0) {
        // `batchLimit` only bounds reviews fetched; stopping here leaves the rest at `new` for the next tick.
        quotaExhaustedMidBatch = true;
        break;
      }

      const claimed = await this.reviewSyncDbService.claimForGeneration(candidate.id);
      if (!claimed) {
        skipped += 1;
        reviewsHandled += 1;
        this.logger.warn(
          `Review ${candidate.id} stopped being a generation candidate before it could be claimed (already generated for, or no longer 'new'); skipping.`
        );
        continue;
      }

      try {
        const draftsGenerated = await this.generateAndPersistForCandidate(
          input.tenantId,
          candidate,
          businessName,
          promptCache,
          remainingQuota,
          batchSettings
        );
        generated += draftsGenerated;
        remainingQuota -= draftsGenerated;
        reviewsHandled += 1;
        consecutiveFailures = 0;
      } catch (error) {
        failed += 1;
        reviewsHandled += 1;
        consecutiveFailures += 1;
        this.logger.error(
          `Generation failed for review ${candidate.id}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );

        // Must not escape: a rejection here (likely when the DB is degraded) would abandon the remaining
        // candidates. A stale claim is swept by `reclaimStaleGenerationClaims`.
        try {
          await this.reviewSyncDbService.releaseGenerationClaim(candidate.id);
        } catch (releaseError) {
          this.logger.error(
            `Could not release the generation claim on review ${candidate.id}; it will be swept as a stale claim in ${'~30 minutes'}: ${
              releaseError instanceof Error ? releaseError.message : String(releaseError)
            }`
          );
        }

        // Stop when the next attempt would fail identically (missing API key, provider outage); each costs a
        // claim, a 30s timeout and a release.
        if (error instanceof AiProviderNotConfiguredException) {
          this.logger.error(
            `AI provider is not configured — abandoning the remaining ${
              candidates.length - reviewsHandled
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
      `Generated ${generated} draft(s) across ${reviewsHandled}/${candidates.length} review(s) for location ${input.locationId} (${skipped} skipped, ${failed} failed)${
        quotaExhaustedMidBatch ? ' — stopped early, monthly AI-draft quota exhausted mid-batch' : ''
      }.`
    );

    return { generated, skipped, failed, quotaReached: quotaExhaustedMidBatch };
  }

  /**
   * Non-escalated candidates yield one `AUTO_REPLY_SUGGESTION`; escalated ones yield `min(ai_reply_count, maxSnippets)`
   * snippets sharing one `generation_group_id`. Returns the rows persisted, for the caller's quota counter.
   * Snippets come from one provider call, not a loop: repeated single-reply calls return near-duplicates, and one call
   * is all-or-nothing so quota accounting has no partial state. `maxOutputTokens` scales with `snippetCount` so the
   * JSON array isn't truncated. reviewerName/reviewText fall back to a generic phrase: star-only reviews have neither.
   */
  private async generateAndPersistForCandidate(
    tenantId: string,
    candidate: GenerationCandidateRow,
    businessName: string,
    promptCache: Map<PromptCategory, CurrentPromptForCategory | null>,
    maxSnippets: number,
    settings: BatchSettings
  ): Promise<number> {
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

    const isEscalated = candidate.classification === ReviewClassification.ESCALATED;
    const snippetCount = isEscalated
      ? Math.min(settings.aiReplyCount, Math.max(1, Math.floor(maxSnippets)))
      : 1;
    const generationGroupId = isEscalated ? randomUUID() : null;

    const systemPrompt = buildSystemPrompt(current.tone, snippetCount);
    const result = await this.aiProvider.generateReply({
      systemPrompt,
      userPrompt,
      ...(snippetCount > 1 ? { maxOutputTokens: AI_MAX_OUTPUT_TOKENS * snippetCount } : {}),
    });

    const contents =
      snippetCount > 1 ? parseMultiSnippetReplies(result.content, snippetCount) : [result.content];
    if (contents === null) {
      throw new AiGenerationFailedException();
    }

    const generationMetadata = {
      model: result.model,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      latencyMs: result.latencyMs,
      finishReason: result.finishReason,
      category,
      tone: current.tone,
    };

    let persisted = 0;
    try {
      for (const content of contents) {
        const responseId = await this.reviewSyncDbService.insertGeneratedResponse({
          tenantId,
          reviewId: candidate.id,
          responseType: isEscalated
            ? ResponseType.ESCALATION_SNIPPET
            : ResponseType.AUTO_REPLY_SUGGESTION,
          content,
          generationGroupId,
          generationMetadata,
        });
        persisted += 1;

        if (!isEscalated && settings.autoPostEnabled) {
          await this.maybeAutoApproveAndPost(tenantId, candidate.id, responseId, content);
        }
      }
    } catch (error) {
      // Rows already written are real drafts counting against the quota; throwing would report zero drafts
      // and hide them. Only a failure before anything persisted is a failed review.
      if (persisted === 0) {
        throw error;
      }
      this.logger.error(
        `Persisted ${persisted}/${contents.length} draft(s) for review ${candidate.id} before an insert failed (${
          error instanceof Error ? error.message : String(error)
        }); keeping the ${persisted} saved.`
      );
    }

    return persisted;
  }

  /**
   * When `auto_post_enabled` (no settings row = false), approves via `approveResponse` (same CAS as the human path)
   * and queues the post. A lost CAS or live-reply index violation (a human reply in the same window) is logged and
   * swallowed: a post failure must not release the generation claim and duplicate a good row next tick.
   */
  private async maybeAutoApproveAndPost(
    tenantId: string,
    reviewId: string,
    responseId: string,
    content: string
  ): Promise<void> {
    try {
      const approved = await this.reviewSyncDbService.approveResponse({
        responseId,
        reviewId,
        tenantId,
        approvedByUserId: null,
        content,
        source: ResponseSource.AI_GENERATED,
      });

      if (!approved) {
        this.logger.warn(
          `Auto-approve skipped for response ${responseId} (review ${reviewId}): it was no longer pending approval by the time this ran.`
        );
        return;
      }

      // Never throws: if the queue is unreachable the response is moved to `post_failed` (visible,
      // retryable) instead of being left `approved` with no job behind it.
      await enqueuePostOrMarkFailed(
        {
          reviewPostQueue: this.reviewPostQueue,
          reviewSyncDbService: this.reviewSyncDbService,
          logger: this.logger,
        },
        { tenantId, reviewId, responseId }
      );
    } catch (error) {
      if (isUniqueViolation(error, LIVE_REPLY_INDEX)) {
        this.logger.warn(
          `Auto-approve skipped for response ${responseId} (review ${reviewId}): the review already has a live reply.`
        );
        return;
      }
      this.logger.error(
        `Auto-post step failed for response ${responseId} (review ${reviewId}); the draft itself was still persisted and remains pending approval: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /** Clamped defensively; the column's CHECK already enforces 1..3. */
  private async resolveBatchSettings(tenantId: string): Promise<BatchSettings> {
    const [aiReplyCountRaw, autoPostEnabled] = await Promise.all([
      this.settingsDbService.findAiReplyCount(tenantId),
      this.settingsDbService.findAutoPostEnabled(tenantId).catch((error: unknown) => {
        // A failed read must not stop drafting — it just means nothing is auto-posted this tick.
        this.logger.error(
          `Could not read auto_post_enabled for tenant ${tenantId}; drafts stay pending approval this tick: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return null;
      }),
    ]);

    return {
      aiReplyCount:
        aiReplyCountRaw === null
          ? DEFAULT_AI_REPLY_COUNT
          : Math.min(Math.max(aiReplyCountRaw, DEFAULT_AI_REPLY_COUNT), MAX_AI_REPLY_COUNT),
      autoPostEnabled: autoPostEnabled === true,
    };
  }
}
