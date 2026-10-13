import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { ConnectionsDbService } from '@db/repositories/connections/connections.db-service';
import { PromptsDbService } from '@db/repositories/prompts/prompts.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { GenerationCandidateRow } from '@db/repositories/review-sync/types/review-sync.type';
import { SettingsDbService } from '@db/repositories/settings/settings.db-service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ReviewPostQueue } from '@review-post-queue/review-post.queue';

import { AiReplyGenerationService } from './ai-reply-generation.service';
import {
  AI_MAX_OUTPUT_TOKENS,
  GENERATION_BATCH_LIMIT,
  MAX_CONSECUTIVE_GENERATION_FAILURES,
} from './constants/ai.constants';
import { AiProviderNotConfiguredException } from './exceptions/ai.exceptions';
import { AiProvider } from './providers/ai.provider';
import type { GenerateReplyResult } from './types/ai-provider.type';

describe('AiReplyGenerationService.generateForClassifiedReviews', () => {
  let target: AiReplyGenerationService;
  let aiProvider: { generateReply: jest.Mock };
  let promptsDbService: { findCurrentForCategory: jest.Mock };
  let authDbService: { findTenantStatus: jest.Mock };
  let billingEntitlementsService: { getEntitlements: jest.Mock };
  let reviewSyncDbService: {
    findClassifiedNeedingGeneration: jest.Mock;
    claimForGeneration: jest.Mock;
    releaseGenerationClaim: jest.Mock;
    insertGeneratedResponse: jest.Mock;
    markResponsePostFailed: jest.Mock;
    reclaimStaleGenerationClaims: jest.Mock;
    approveResponse: jest.Mock;
  };
  let settingsDbService: { findAiReplyCount: jest.Mock; findAutoPostEnabled: jest.Mock };
  let reviewPostQueue: { addPostJob: jest.Mock };
  let connectionsDbService: { findLocationForTenant: jest.Mock };

  const tenantId = '0190f4a1-7c33-7e51-9a02-6d1b8f4c0001';
  const locationId = '0190f4a1-7c33-7e51-9a02-6d1b8f4c0002';

  const autoReplyCandidate: GenerationCandidateRow = {
    id: 'review-1',
    rating: 5,
    reviewText: 'Loved it, thank you!',
    reviewerName: 'Jamie L.',
    classification: ReviewClassification.AUTO_REPLY_CANDIDATE,
  };

  const escalatedCandidate: GenerationCandidateRow = {
    id: 'review-2',
    rating: 1,
    reviewText: 'Terrible service.',
    reviewerName: 'Alex',
    classification: ReviewClassification.ESCALATED,
  };

  const providerResult: GenerateReplyResult = {
    content: 'Thank you for your feedback!',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    promptTokens: 100,
    completionTokens: 20,
    latencyMs: 800,
    finishReason: 'stop',
  };

  beforeEach(async () => {
    aiProvider = { generateReply: jest.fn().mockResolvedValue(providerResult) };
    promptsDbService = {
      findCurrentForCategory: jest.fn().mockResolvedValue({
        promptId: 'prompt-1',
        tone: 'professional',
        template:
          'You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: "{{review_text}}"',
      }),
    };
    authDbService = {
      findTenantStatus: jest.fn().mockResolvedValue({ id: tenantId, name: 'Acme Cafe' }),
    };
    billingEntitlementsService = {
      // Paid plan by default (null = unlimited) so quota never constrains tests not about quota.
      getEntitlements: jest
        .fn()
        .mockResolvedValue({ maxAiDraftsPerMonth: null, aiDraftsUsedThisMonth: 0 }),
    };
    reviewSyncDbService = {
      findClassifiedNeedingGeneration: jest.fn().mockResolvedValue([]),
      claimForGeneration: jest.fn().mockResolvedValue(true),
      releaseGenerationClaim: jest.fn().mockResolvedValue(undefined),
      insertGeneratedResponse: jest.fn().mockResolvedValue('response-1'),
      markResponsePostFailed: jest.fn().mockResolvedValue(null),
      reclaimStaleGenerationClaims: jest.fn().mockResolvedValue(0),
      approveResponse: jest.fn().mockResolvedValue(null),
    };
    // 1 snippet per escalated review by default; tests override this to exercise multi-snippet clamping.
    settingsDbService = {
      findAiReplyCount: jest.fn().mockResolvedValue(1),
      findAutoPostEnabled: jest.fn().mockResolvedValue(false),
    };
    reviewPostQueue = { addPostJob: jest.fn().mockResolvedValue(undefined) };
    connectionsDbService = { findLocationForTenant: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiReplyGenerationService,
        { provide: AiProvider, useValue: aiProvider },
        { provide: PromptsDbService, useValue: promptsDbService },
        { provide: AuthDbService, useValue: authDbService },
        { provide: ConnectionsDbService, useValue: connectionsDbService },
        { provide: BillingEntitlementsService, useValue: billingEntitlementsService },
        { provide: ReviewSyncDbService, useValue: reviewSyncDbService },
        { provide: SettingsDbService, useValue: settingsDbService },
        { provide: ReviewPostQueue, useValue: reviewPostQueue },
      ],
    }).compile();

    target = module.get(AiReplyGenerationService);
  });

  it('short-circuits on the tenant-wide quota before ever reading a candidate', async () => {
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: 20,
      aiDraftsUsedThisMonth: 20,
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(result).toEqual({ generated: 0, skipped: 0, failed: 0, quotaReached: true });
    expect(reviewSyncDbService.findClassifiedNeedingGeneration).not.toHaveBeenCalled();
  });

  it('still reclaims stale claims for a tenant already at its monthly quota', async () => {
    // Regression: the reclaim used to sit after the quota check, so a review stranded at 'in_review'
    // stayed stuck until the cap reset, though recovering it costs no quota.
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: 20,
      aiDraftsUsedThisMonth: 20,
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.reclaimStaleGenerationClaims).toHaveBeenCalledWith(locationId);
    expect(result.quotaReached).toBe(true);
  });

  it("gives the system prompt the location's phone and website, so a reply never needs a placeholder", async () => {
    connectionsDbService.findLocationForTenant.mockResolvedValue({
      phone: '+49 30 1234567',
      websiteUri: 'https://coastal.example',
    });
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(connectionsDbService.findLocationForTenant).toHaveBeenCalledWith(locationId, tenantId);
    expect(aiProvider.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining(
          'phone +49 30 1234567; website https://coastal.example'
        ),
      })
    );
  });

  it('tells the model there are no contact details when the location lists none', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining('No contact details are available'),
      })
    );
  });

  it('does nothing when there are no candidates', async () => {
    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(result).toEqual({ generated: 0, skipped: 0, failed: 0, quotaReached: false });
    expect(authDbService.findTenantStatus).not.toHaveBeenCalled();
  });

  it('generates and persists an AUTO_REPLY_SUGGESTION with no generation group for an auto-reply candidate', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.claimForGeneration).toHaveBeenCalledWith('review-1');
    expect(promptsDbService.findCurrentForCategory).toHaveBeenCalledWith(tenantId, 'positive');
    expect(aiProvider.generateReply).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('professional tone'),
      userPrompt:
        'You are replying on behalf of Acme Cafe to a 5-star review from a reviewer.\n\nReview: "Loved it, thank you!"',
    });
    expect(reviewSyncDbService.insertGeneratedResponse).toHaveBeenCalledWith({
      tenantId,
      reviewId: 'review-1',
      responseType: ResponseType.AUTO_REPLY_SUGGESTION,
      content: providerResult.content,
      generationGroupId: null,
      generationMetadata: {
        model: providerResult.model,
        promptTokens: providerResult.promptTokens,
        completionTokens: providerResult.completionTokens,
        latencyMs: providerResult.latencyMs,
        finishReason: providerResult.finishReason,
        category: 'positive',
        tone: 'professional',
      },
    });
    expect(reviewSyncDbService.releaseGenerationClaim).not.toHaveBeenCalled();
    expect(result).toEqual({ generated: 1, skipped: 0, failed: 0, quotaReached: false });
  });

  it('auto-approves and queues a post-back job for a non-escalated draft when auto_post_enabled is true', async () => {
    settingsDbService.findAutoPostEnabled.mockResolvedValue(true);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    reviewSyncDbService.approveResponse.mockResolvedValue({ id: 'response-1' });

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.approveResponse).toHaveBeenCalledWith({
      responseId: 'response-1',
      reviewId: 'review-1',
      tenantId,
      approvedByUserId: null,
      content: providerResult.content,
      source: 'ai_generated',
    });
    expect(reviewPostQueue.addPostJob).toHaveBeenCalledWith({
      tenantId,
      reviewId: 'review-1',
      responseId: 'response-1',
    });
  });

  it('does not auto-approve or queue a post when auto_post_enabled is false', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.approveResponse).not.toHaveBeenCalled();
    expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
  });

  it('saves a reply cut off at the token cap as a draft instead of auto-posting it', async () => {
    settingsDbService.findAutoPostEnabled.mockResolvedValue(true);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    aiProvider.generateReply.mockResolvedValue({ ...providerResult, finishReason: 'length' });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.insertGeneratedResponse).toHaveBeenCalledTimes(1);
    expect(reviewSyncDbService.approveResponse).not.toHaveBeenCalled();
    expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
    expect(result.generated).toBe(1);
  });

  it('never auto-approves an escalated snippet even when auto_post_enabled is true', async () => {
    settingsDbService.findAutoPostEnabled.mockResolvedValue(true);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.approveResponse).not.toHaveBeenCalled();
    expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
    expect(result.generated).toBe(1);
  });

  it('does not fail generation when the auto-post step itself throws', async () => {
    settingsDbService.findAutoPostEnabled.mockResolvedValue(true);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    reviewSyncDbService.approveResponse.mockRejectedValue(new Error('db unavailable'));

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(result).toEqual({ generated: 1, skipped: 0, failed: 0, quotaReached: false });
    expect(reviewSyncDbService.releaseGenerationClaim).not.toHaveBeenCalled();
  });

  it('moves the response to post_failed, instead of leaving it approved, when the post queue is unreachable', async () => {
    settingsDbService.findAutoPostEnabled.mockResolvedValue(true);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    reviewSyncDbService.approveResponse.mockResolvedValue({ id: 'response-1' });
    reviewPostQueue.addPostJob.mockRejectedValue(new Error('redis down'));

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.markResponsePostFailed).toHaveBeenCalledWith(
      expect.objectContaining({ responseId: 'response-1' })
    );
    expect(result).toEqual({ generated: 1, skipped: 0, failed: 0, quotaReached: false });
  });

  it('still drafts, but posts nothing, when reading auto_post_enabled fails', async () => {
    settingsDbService.findAutoPostEnabled.mockRejectedValue(new Error('db blip'));
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(result.generated).toBe(1);
    expect(reviewSyncDbService.approveResponse).not.toHaveBeenCalled();
    expect(reviewPostQueue.addPostJob).not.toHaveBeenCalled();
  });

  it('reads tenant settings once for the whole batch, not once per review', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([
      autoReplyCandidate,
      { ...autoReplyCandidate, id: 'review-2' },
      { ...escalatedCandidate, id: 'review-3' },
    ]);

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(settingsDbService.findAiReplyCount).toHaveBeenCalledTimes(1);
    expect(settingsDbService.findAutoPostEnabled).toHaveBeenCalledTimes(1);
  });

  it('keeps and counts the drafts already saved when a later snippet insert fails', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B', 'Option C']),
    });
    reviewSyncDbService.insertGeneratedResponse
      .mockResolvedValueOnce('response-1')
      .mockResolvedValueOnce('response-2')
      .mockRejectedValueOnce(new Error('db blip'));

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    // Two rows exist and count against the quota; reporting failure with zero drafts would hide them.
    expect(result).toEqual({ generated: 2, skipped: 0, failed: 0, quotaReached: false });
    expect(reviewSyncDbService.releaseGenerationClaim).not.toHaveBeenCalled();
  });

  it('treats a review as failed when the very first snippet insert fails', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B', 'Option C']),
    });
    reviewSyncDbService.insertGeneratedResponse.mockRejectedValue(new Error('db down'));

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(result).toEqual({ generated: 0, skipped: 0, failed: 1, quotaReached: false });
  });

  it('generates an ESCALATION_SNIPPET with a real generation group id for an escalated review', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(promptsDbService.findCurrentForCategory).toHaveBeenCalledWith(tenantId, 'escalated');
    const insertedInput = reviewSyncDbService.insertGeneratedResponse.mock.calls[0]?.[0] as {
      responseType: ResponseType;
      generationGroupId: string | null;
    };
    expect(insertedInput.responseType).toBe(ResponseType.ESCALATION_SNIPPET);
    expect(insertedInput.generationGroupId).toEqual(expect.any(String));
  });

  it('reads tenant_settings.ai_reply_count and generates that many ESCALATION_SNIPPET rows from a single multi-option call sharing one group id', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B', 'Option C']),
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    // One provider call for all 3 snippets, not one per snippet.
    expect(aiProvider.generateReply).toHaveBeenCalledTimes(1);
    expect(reviewSyncDbService.insertGeneratedResponse).toHaveBeenCalledTimes(3);
    const insertedContents = reviewSyncDbService.insertGeneratedResponse.mock.calls.map(
      call => (call[0] as { content: string }).content
    );
    expect(insertedContents).toEqual(['Option A', 'Option B', 'Option C']);
    const groupIds = reviewSyncDbService.insertGeneratedResponse.mock.calls.map(
      call => (call[0] as { generationGroupId: string }).generationGroupId
    );
    expect(new Set(groupIds).size).toBe(1);
    expect(result.generated).toBe(3);
  });

  // Regression: the fallback said 1 while the column default is 2, so a tenant missing its settings row got fewer drafts.
  it('falls back to the column default of 2 snippets when the tenant has no settings row', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(null);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B']),
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.insertGeneratedResponse).toHaveBeenCalledTimes(2);
    expect(result.generated).toBe(2);
  });

  it('clamps a stored count below the minimum up to one snippet, not to the default', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(0);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.insertGeneratedResponse).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
  });

  it('fails the candidate (not the batch) when the model does not return valid multi-option JSON', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: 'Sure, here are three options: 1. Thanks! 2. Appreciated! 3. Great!',
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.insertGeneratedResponse).not.toHaveBeenCalled();
    expect(result).toEqual({ generated: 0, skipped: 0, failed: 1, quotaReached: false });
  });

  it('scales the output-token budget by snippet count for a multi-option call', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B', 'Option C']),
    });

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: AI_MAX_OUTPUT_TOKENS * 3 })
    );
  });

  // Regression: ai_reply_count used to apply to escalated reviews only, though the setting is per review.
  it('generates ai_reply_count drafts for a non-escalated review too, grouped so they are labelled A, B, C', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B', 'Option C']),
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledTimes(1);
    const inserted = reviewSyncDbService.insertGeneratedResponse.mock.calls.map(
      call => call[0] as { responseType: ResponseType; generationGroupId: string | null }
    );
    expect(inserted).toHaveLength(3);
    expect(inserted.every(row => row.responseType === ResponseType.AUTO_REPLY_SUGGESTION)).toBe(
      true
    );
    expect(inserted[0]?.generationGroupId).toEqual(expect.any(String));
    expect(new Set(inserted.map(row => row.generationGroupId)).size).toBe(1);
    expect(result.generated).toBe(3);
  });

  it('gives a review that will be auto-posted a single draft, whatever ai_reply_count says', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    settingsDbService.findAutoPostEnabled.mockResolvedValue(true);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    reviewSyncDbService.approveResponse.mockResolvedValue({ id: 'response-1' });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    // No one picks between drafts before an auto-post, so extra ones would only use up the quota.
    expect(aiProvider.generateReply).toHaveBeenCalledWith(
      expect.not.objectContaining({ maxOutputTokens: expect.anything() })
    );
    expect(reviewSyncDbService.insertGeneratedResponse).toHaveBeenCalledWith(
      expect.objectContaining({ generationGroupId: null })
    );
    expect(reviewSyncDbService.approveResponse).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
  });

  it("clamps a non-escalated review's draft count to the tenant's remaining monthly quota", async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: 20,
      aiDraftsUsedThisMonth: 18,
    });
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B']),
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.insertGeneratedResponse).toHaveBeenCalledTimes(2);
    expect(result.generated).toBe(2);
  });

  it("clamps an escalated review's snippet count to the tenant's remaining monthly quota instead of overshooting it", async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: 20,
      aiDraftsUsedThisMonth: 19,
    });
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([escalatedCandidate]);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
  });

  it('stops the batch and reports quotaReached when the quota is exhausted partway through, leaving later candidates untouched', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: 20,
      aiDraftsUsedThisMonth: 17,
    });
    const secondEscalated: GenerationCandidateRow = { ...escalatedCandidate, id: 'review-3' };
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([
      escalatedCandidate,
      secondEscalated,
    ]);
    aiProvider.generateReply.mockResolvedValue({
      ...providerResult,
      content: JSON.stringify(['Option A', 'Option B', 'Option C']),
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    // Only 3 units remain: the first escalated candidate spends all 3, leaving none for the second.
    expect(result.generated).toBe(3);
    expect(reviewSyncDbService.claimForGeneration).toHaveBeenCalledTimes(1);
    expect(reviewSyncDbService.claimForGeneration).toHaveBeenCalledWith(escalatedCandidate.id);
    expect(result.quotaReached).toBe(true);
  });

  it('substitutes a generic fallback when reviewerName/reviewText are null (a rating-only Google review)', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([
      { ...autoReplyCandidate, reviewerName: null, reviewText: null },
    ]);

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining('a reviewer'),
      })
    );
  });

  it('resolves the business name and the per-category prompt only once for a multi-review batch', async () => {
    const secondPositive: GenerationCandidateRow = { ...autoReplyCandidate, id: 'review-3' };
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([
      autoReplyCandidate,
      secondPositive,
    ]);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(authDbService.findTenantStatus).toHaveBeenCalledTimes(1);
    expect(promptsDbService.findCurrentForCategory).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(2);
  });

  it('skips a candidate that loses the claim CAS, without calling the provider for it', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    reviewSyncDbService.claimForGeneration.mockResolvedValue(false);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).not.toHaveBeenCalled();
    expect(result).toEqual({ generated: 0, skipped: 1, failed: 0, quotaReached: false });
  });

  it('releases the claim and counts a failure when the provider call throws, without stopping the rest of the batch', async () => {
    const secondCandidate: GenerationCandidateRow = { ...autoReplyCandidate, id: 'review-3' };
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([
      autoReplyCandidate,
      secondCandidate,
    ]);
    aiProvider.generateReply
      .mockRejectedValueOnce(new Error('upstream 500'))
      .mockResolvedValueOnce(providerResult);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.releaseGenerationClaim).toHaveBeenCalledWith('review-1');
    expect(reviewSyncDbService.releaseGenerationClaim).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ generated: 1, skipped: 0, failed: 1, quotaReached: false });
  });

  it('releases the claim and counts a failure when no prompt is configured for the resolved category', async () => {
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);
    promptsDbService.findCurrentForCategory.mockResolvedValue(null);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).not.toHaveBeenCalled();
    expect(reviewSyncDbService.releaseGenerationClaim).toHaveBeenCalledWith('review-1');
    expect(result).toEqual({ generated: 0, skipped: 0, failed: 1, quotaReached: false });
  });

  it('clamps the batch to the remaining monthly quota, not just the per-tick cap', async () => {
    // Regression: quota used to be a boolean gate asked once, so a tenant 1 draft under its cap
    // generated a full 20-review batch, 19 billable drafts past it.
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: 20,
      aiDraftsUsedThisMonth: 19,
    });

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.findClassifiedNeedingGeneration).toHaveBeenCalledWith(
      tenantId,
      locationId,
      1
    );
  });

  it('uses the full per-tick cap when the plan has no draft limit at all', async () => {
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: null,
      aiDraftsUsedThisMonth: 4_000,
    });

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.findClassifiedNeedingGeneration).toHaveBeenCalledWith(
      tenantId,
      locationId,
      GENERATION_BATCH_LIMIT
    );
  });

  it('sweeps stale claims before reading candidates, so a dead worker strands nothing permanently', async () => {
    // Nothing else moves a review off `in_review`; the sweep must run before the `new`-only candidate
    // query or a review claimed by a dead worker is invisible forever.
    reviewSyncDbService.reclaimStaleGenerationClaims.mockResolvedValue(2);

    await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.reclaimStaleGenerationClaims).toHaveBeenCalledWith(locationId);
    expect(
      reviewSyncDbService.reclaimStaleGenerationClaims.mock.invocationCallOrder[0]
    ).toBeLessThan(
      reviewSyncDbService.findClassifiedNeedingGeneration.mock.invocationCallOrder[0] as number
    );
  });

  it('keeps processing the batch when releasing a claim itself fails', async () => {
    // Release runs in the catch block; unguarded, its rejection (likely when the DB is degraded)
    // would abandon every remaining candidate.
    const second: GenerationCandidateRow = { ...autoReplyCandidate, id: 'review-3' };
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([
      autoReplyCandidate,
      second,
    ]);
    aiProvider.generateReply
      .mockRejectedValueOnce(new Error('upstream 500'))
      .mockResolvedValueOnce(providerResult);
    reviewSyncDbService.releaseGenerationClaim.mockRejectedValue(new Error('pool exhausted'));

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(result).toEqual({ generated: 1, skipped: 0, failed: 1, quotaReached: false });
  });

  it('abandons the batch immediately when the provider is not configured', async () => {
    // Every remaining candidate would fail identically, each costing a claim, a release and a full 30s timeout.
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      ...autoReplyCandidate,
      id: `review-${index}`,
    }));
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue(candidates);
    aiProvider.generateReply.mockRejectedValue(new AiProviderNotConfiguredException());

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(1);
  });

  it('abandons the batch after three consecutive failures, treating the provider as down', async () => {
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      ...autoReplyCandidate,
      id: `review-${index}`,
    }));
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue(candidates);
    aiProvider.generateReply.mockRejectedValue(new Error('provider timeout'));

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledTimes(MAX_CONSECUTIVE_GENERATION_FAILURES);
    expect(result.failed).toBe(MAX_CONSECUTIVE_GENERATION_FAILURES);
  });

  it('does not abandon the batch for scattered, non-consecutive failures', async () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      ...autoReplyCandidate,
      id: `review-${index}`,
    }));
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue(candidates);
    aiProvider.generateReply
      .mockRejectedValueOnce(new Error('one bad review'))
      .mockResolvedValueOnce(providerResult)
      .mockRejectedValueOnce(new Error('another bad review'))
      .mockResolvedValueOnce(providerResult)
      .mockResolvedValueOnce(providerResult);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledTimes(5);
    expect(result).toEqual({ generated: 3, skipped: 0, failed: 2, quotaReached: false });
  });
});
