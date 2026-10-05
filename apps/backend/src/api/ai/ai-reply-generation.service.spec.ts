import { UserRole } from '@auth/enums/user-role.enum';
import { AiDraftLimitReachedException } from '@billing/exceptions/billing.exceptions';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewClassification } from '@common/enums/review-classification.enum';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
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
import {
  AiPromptNotConfiguredException,
  AiProviderNotConfiguredException,
} from './exceptions/ai.exceptions';
import { AiProvider } from './providers/ai.provider';
import type { GenerateReplyResult } from './types/ai-provider.type';

import { JwtTokenType } from '../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../auth/types/auth.type';

describe('AiReplyGenerationService', () => {
  let target: AiReplyGenerationService;
  let aiProvider: { generateReply: jest.Mock };
  let promptsDbService: { findCurrentForCategory: jest.Mock };
  let authDbService: { findTenantStatus: jest.Mock };
  let billingEntitlementsService: { canGenerateAiDraft: jest.Mock };
  let reviewSyncDbService: {
    findClassifiedNeedingGeneration: jest.Mock;
    claimForGeneration: jest.Mock;
    releaseGenerationClaim: jest.Mock;
    insertGeneratedResponse: jest.Mock;
    approveResponse: jest.Mock;
  };
  let settingsDbService: { findAiReplyCount: jest.Mock; findAutoPostEnabled: jest.Mock };
  let reviewPostQueue: { addPostJob: jest.Mock };

  const tenantUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: '0190f3b2-1c44-7a10-8f31-2b7c9e5d0002',
    tenantId: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0001',
    email: 'owner@example.com',
    role: UserRole.OWNER,
    locale: null,
  };

  const mockReview = { reviewerName: 'Jamie L.', rating: 5, reviewText: 'Loved it, thank you!' };

  const providerResult: GenerateReplyResult = {
    content: 'Thank you so much, Jamie!',
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
      findTenantStatus: jest.fn().mockResolvedValue({ id: tenantUser.tenantId, name: 'Acme Cafe' }),
    };
    billingEntitlementsService = { canGenerateAiDraft: jest.fn().mockResolvedValue(true) };
    reviewSyncDbService = {
      findClassifiedNeedingGeneration: jest.fn().mockResolvedValue([]),
      claimForGeneration: jest.fn().mockResolvedValue(true),
      releaseGenerationClaim: jest.fn().mockResolvedValue(undefined),
      insertGeneratedResponse: jest.fn().mockResolvedValue('response-1'),
      approveResponse: jest.fn().mockResolvedValue(null),
    };
    settingsDbService = {
      findAiReplyCount: jest.fn().mockResolvedValue(null),
      findAutoPostEnabled: jest.fn().mockResolvedValue(false),
    };
    reviewPostQueue = { addPostJob: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiReplyGenerationService,
        { provide: AiProvider, useValue: aiProvider },
        { provide: PromptsDbService, useValue: promptsDbService },
        { provide: AuthDbService, useValue: authDbService },
        { provide: BillingEntitlementsService, useValue: billingEntitlementsService },
        { provide: ReviewSyncDbService, useValue: reviewSyncDbService },
        { provide: SettingsDbService, useValue: settingsDbService },
        { provide: ReviewPostQueue, useValue: reviewPostQueue },
      ],
    }).compile();

    target = module.get(AiReplyGenerationService);
  });

  it("fills the tenant's current template with the mock review and calls the provider", async () => {
    const result = await target.generateDryRunReply(
      { category: 'positive', review: mockReview },
      tenantUser.tenantId
    );

    expect(promptsDbService.findCurrentForCategory).toHaveBeenCalledWith(
      tenantUser.tenantId,
      'positive'
    );
    expect(aiProvider.generateReply).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('professional tone'),
      // Trailing ".." is real, not a typo: the template's own punctuation ("... {{reviewer_name}}.")
      // runs straight into "Jamie L." already ending in a period — a template author can't see this
      // collision coming, which is exactly the kind of thing a dry run against realistic mock data
      // is for.
      userPrompt:
        'You are replying on behalf of Acme Cafe to a 5-star review from Jamie L..\n\nReview: "Loved it, thank you!"',
    });
    expect(result).toEqual({
      content: providerResult.content,
      model: providerResult.model,
      promptTokens: providerResult.promptTokens,
      completionTokens: providerResult.completionTokens,
      latencyMs: providerResult.latencyMs,
      finishReason: 'stop',
      category: 'positive',
      tone: 'professional',
      usedTemplateOverride: false,
    });
  });

  it("falls back to a generic, non-identifying business name when the tenant has no name on record — never the owner's email", async () => {
    authDbService.findTenantStatus.mockResolvedValue(null);

    await target.generateDryRunReply(
      { category: 'positive', review: mockReview },
      tenantUser.tenantId
    );

    expect(aiProvider.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({ userPrompt: expect.stringContaining('the business') })
    );
    expect(aiProvider.generateReply).not.toHaveBeenCalledWith(
      expect.objectContaining({ userPrompt: expect.stringContaining('owner@example.com') })
    );
  });

  it("uses a caller-supplied template override instead of the tenant's saved template", async () => {
    const result = await target.generateDryRunReply(
      {
        category: 'positive',
        review: mockReview,
        templateOverride: 'Reply to {{reviewer_name}}: thanks for the {{rating}} stars!',
        toneOverride: 'playful',
      },
      tenantUser.tenantId
    );

    expect(aiProvider.generateReply).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('playful tone'),
      userPrompt: 'Reply to Jamie L.: thanks for the 5 stars!',
    });
    expect(result.usedTemplateOverride).toBe(true);
    expect(result.tone).toBe('playful');
  });

  it("uses the tenant's saved tone (not the platform default) when templateOverride is given without toneOverride", async () => {
    // Regression test: an earlier version of resolveTemplateAndTone only looked up the tenant's
    // saved prompt in the non-override branch, so a templateOverride-only dry run silently reset
    // to DEFAULT_PROMPT_TONE ('professional') instead of previewing the tenant's actual saved tone
    // — the tenant here has 'professional' saved by default, so use a distinct tone to prove it's
    // actually read, not merely coinciding with the default.
    promptsDbService.findCurrentForCategory.mockResolvedValue({
      promptId: 'prompt-1',
      tone: 'empathetic',
      template: 'irrelevant — templateOverride replaces this',
    });

    const result = await target.generateDryRunReply(
      { category: 'positive', review: mockReview, templateOverride: 'Reply to {{reviewer_name}}!' },
      tenantUser.tenantId
    );

    expect(promptsDbService.findCurrentForCategory).toHaveBeenCalledWith(
      tenantUser.tenantId,
      'positive'
    );
    expect(result.tone).toBe('empathetic');
    expect(aiProvider.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: expect.stringContaining('empathetic tone') })
    );
  });

  it('falls back to the platform default tone when templateOverride is given and the tenant has no prompt row at all', async () => {
    promptsDbService.findCurrentForCategory.mockResolvedValue(null);

    const result = await target.generateDryRunReply(
      { category: 'positive', review: mockReview, templateOverride: 'Reply to {{reviewer_name}}!' },
      tenantUser.tenantId
    );

    expect(result.tone).toBe('professional');
    expect(result.usedTemplateOverride).toBe(true);
  });

  it('applies a tone override on top of the saved template', async () => {
    const result = await target.generateDryRunReply(
      { category: 'positive', review: mockReview, toneOverride: 'formal' },
      tenantUser.tenantId
    );

    expect(result.tone).toBe('formal');
    expect(result.usedTemplateOverride).toBe(false);
  });

  it("throws when the plan's monthly AI-draft limit is reached, before ever calling the provider", async () => {
    billingEntitlementsService.canGenerateAiDraft.mockResolvedValue(false);

    await expect(
      target.generateDryRunReply({ category: 'positive', review: mockReview }, tenantUser.tenantId)
    ).rejects.toBeInstanceOf(AiDraftLimitReachedException);

    expect(aiProvider.generateReply).not.toHaveBeenCalled();
  });

  it('throws when the tenant has no prompt configured for the requested category and no override is given', async () => {
    promptsDbService.findCurrentForCategory.mockResolvedValue(null);

    await expect(
      target.generateDryRunReply({ category: 'escalated', review: mockReview }, tenantUser.tenantId)
    ).rejects.toBeInstanceOf(AiPromptNotConfiguredException);

    expect(aiProvider.generateReply).not.toHaveBeenCalled();
  });
});

describe('AiReplyGenerationService.generateForClassifiedReviews', () => {
  let target: AiReplyGenerationService;
  let aiProvider: { generateReply: jest.Mock };
  let promptsDbService: { findCurrentForCategory: jest.Mock };
  let authDbService: { findTenantStatus: jest.Mock };
  let billingEntitlementsService: { canGenerateAiDraft: jest.Mock; getEntitlements: jest.Mock };
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
      canGenerateAiDraft: jest.fn().mockResolvedValue(true),
      // Paid plan by default: null means unlimited, so quota never constrains a test that
      // isn't specifically about quota.
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
    // Defaults to 1 snippet per escalated review — individual tests override this to exercise the
    // multi-snippet / quota-clamping behavior specifically.
    settingsDbService = {
      findAiReplyCount: jest.fn().mockResolvedValue(1),
      findAutoPostEnabled: jest.fn().mockResolvedValue(false),
    };
    reviewPostQueue = { addPostJob: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiReplyGenerationService,
        { provide: AiProvider, useValue: aiProvider },
        { provide: PromptsDbService, useValue: promptsDbService },
        { provide: AuthDbService, useValue: authDbService },
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
    // Regression: the reclaim used to sit after the quota check, so a review a dead worker
    // stranded at 'in_review' stayed stuck until the cap reset next calendar month — even though
    // recovering it costs the quota nothing (it's a plain UPDATE, not a generation call).
    billingEntitlementsService.getEntitlements.mockResolvedValue({
      maxAiDraftsPerMonth: 20,
      aiDraftsUsedThisMonth: 20,
    });

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(reviewSyncDbService.reclaimStaleGenerationClaims).toHaveBeenCalledWith(locationId);
    expect(result.quotaReached).toBe(true);
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
      // Trailing ".." is real, not a typo — see the identical case in generateDryRunReply's own
      // spec: the template's own punctuation runs straight into "Jamie L." already ending in one.
      userPrompt:
        'You are replying on behalf of Acme Cafe to a 5-star review from Jamie L..\n\nReview: "Loved it, thank you!"',
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

    // Two rows exist and count against the quota; reporting this review as a failure with zero
    // drafts would hide them from the caller's quota accounting.
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

    // One provider call for all 3 snippets, not one call per snippet — see
    // generateAndPersistForCandidate's own doc comment for why a single multi-option completion
    // (not a loop of identical single-reply calls) is what this is for.
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

  it('never generates more than one draft for a non-escalated review, regardless of ai_reply_count', async () => {
    settingsDbService.findAiReplyCount.mockResolvedValue(3);
    reviewSyncDbService.findClassifiedNeedingGeneration.mockResolvedValue([autoReplyCandidate]);

    const result = await target.generateForClassifiedReviews({ tenantId, locationId });

    expect(aiProvider.generateReply).toHaveBeenCalledTimes(1);
    expect(result.generated).toBe(1);
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
    // Regression: the quota used to be a boolean gate asked once. A tenant 1 draft below its cap
    // passed that gate and then generated a full 20-review batch — 19 billable drafts past a cap
    // the billing module exists to enforce.
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
    // Nothing else in the codebase moves a review off `in_review`, so without this sweep running
    // *before* the (status = 'new'-only) candidate query, a review claimed by a worker that then
    // died is invisible to every later tick forever.
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
    // The release runs in the catch block. Unguarded, its rejection escapes the whole method and
    // abandons every remaining candidate — and it rejects precisely when the DB is already
    // degraded, which is when losing the rest of the batch hurts most.
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
    // Every remaining candidate would fail identically — each costing a claim write, a release
    // write and (for a reachable-but-broken provider) a full 30s timeout.
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
