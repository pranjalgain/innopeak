import { UserRole } from '@auth/enums/user-role.enum';
import { CustomPromptsNotOnPlanException } from '@billing/exceptions/billing.exceptions';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { MESSAGES } from '@common/constants/messages.constants';
import { PromptsDbService } from '@db/repositories/prompts/prompts.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PROMPT_ERROR_CODES } from './constants/prompts.constants';
import {
  MissingPlaceholderException,
  PromptNotFoundException,
  PromptVersionConflictException,
  PromptVersionNotFoundException,
  UnknownPlaceholderException,
} from './exceptions/prompts.exceptions';
import { PromptsService } from './prompts.service';
import type { PromptVersionRecord } from './types/prompt.type';

import { JwtTokenType } from '../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../auth/types/auth.type';

const REQUIRED_TEMPLATE = 'Hello {{business_name}} {{reviewer_name}} {{rating}} {{review_text}}';

describe('PromptsService', () => {
  let target: PromptsService;
  let promptsDbService: {
    listWithVersions: jest.Mock;
    getCurrentVersion: jest.Mock;
    appendVersion: jest.Mock;
    countVersions: jest.Mock;
    updateTone: jest.Mock;
  };
  let reviewSyncDbService: {
    getPromptVersionStats: jest.Mock;
    getPromptVersionStatsBatch: jest.Mock;
  };
  let billingEntitlementsService: { canEditCustomPrompt: jest.Mock };

  const tenantUser: TenantAuthUser = {
    type: JwtTokenType.TENANT_USER,
    id: '0190f3b2-1c44-7a10-8f31-2b7c9e5d0002',
    tenantId: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0001',
    email: 'owner@example.com',
    role: UserRole.OWNER,
    locale: null,
  };
  const promptId = '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011';

  const currentVersion: PromptVersionRecord = {
    id: 'ver-1',
    promptId,
    version: 1,
    template: REQUIRED_TEMPLATE,
    createdAt: new Date('2026-08-20T10:00:00Z'),
    createdByUserId: null,
    createdByName: null,
  };

  beforeEach(async () => {
    promptsDbService = {
      listWithVersions: jest.fn(),
      getCurrentVersion: jest.fn(),
      appendVersion: jest.fn(),
      countVersions: jest.fn(),
      updateTone: jest.fn(),
    };
    reviewSyncDbService = {
      getPromptVersionStats: jest.fn(),
      getPromptVersionStatsBatch: jest.fn(),
    };
    billingEntitlementsService = {
      canEditCustomPrompt: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromptsService,
        { provide: PromptsDbService, useValue: promptsDbService },
        { provide: ReviewSyncDbService, useValue: reviewSyncDbService },
        { provide: BillingEntitlementsService, useValue: billingEntitlementsService },
      ],
    }).compile();

    target = module.get(PromptsService);
  });

  describe('list', () => {
    const promptRow = (id: string) => ({
      id,
      tenantId: tenantUser.tenantId,
      category: 'positive' as const,
      name: 'Positive review reply',
      description: null,
      tone: 'professional' as const,
      createdAt: new Date('2026-08-20T10:00:00Z'),
      updatedAt: new Date('2026-08-20T10:00:00Z'),
    });

    it('omits a prompt with no versions instead of failing the whole listing', async () => {
      promptsDbService.listWithVersions.mockResolvedValue([
        { prompt: promptRow(promptId), versions: [currentVersion] },
        { prompt: promptRow('0190f4a1-7c33-7e51-9a02-6d1b8f4c0022'), versions: [] },
      ]);

      const result = await target.list(tenantUser, false);

      expect(result.prompts).toHaveLength(1);
      expect(result.prompts[0]?.id).toBe(promptId);
    });

    it('surfaces the resolved author name rather than a hardcoded null', async () => {
      promptsDbService.listWithVersions.mockResolvedValue([
        {
          prompt: promptRow(promptId),
          versions: [
            { ...currentVersion, createdByUserId: tenantUser.id, createdByName: 'Maria Delgado' },
          ],
        },
      ]);

      const result = await target.list(tenantUser, false);

      expect(result.prompts[0]?.currentVersion.createdBy).toEqual({
        userId: tenantUser.id,
        name: 'Maria Delgado',
      });
    });

    it('leaves createdBy null when the version has no author recorded', async () => {
      promptsDbService.listWithVersions.mockResolvedValue([
        { prompt: promptRow(promptId), versions: [currentVersion] },
      ]);

      const result = await target.list(tenantUser, false);

      expect(result.prompts[0]?.currentVersion.createdBy).toBeNull();
    });
  });

  describe('createVersion', () => {
    it('rejects with CustomPromptsNotOnPlanException before validating the template when the plan disallows custom prompts', async () => {
      billingEntitlementsService.canEditCustomPrompt.mockResolvedValue(false);

      await expect(
        target.createVersion(promptId, { template: 'Hi {{unknown_var}}' }, tenantUser)
      ).rejects.toThrow(CustomPromptsNotOnPlanException);

      expect(billingEntitlementsService.canEditCustomPrompt).toHaveBeenCalledWith(
        tenantUser.tenantId
      );
      expect(promptsDbService.getCurrentVersion).not.toHaveBeenCalled();
    });

    it('rejects unknown placeholders and names them', async () => {
      await expect(
        target.createVersion(promptId, { template: 'Hi {{unknown_var}}' }, tenantUser)
      ).rejects.toThrow(MESSAGES.PROMPTS.UNKNOWN_VARIABLE(['unknown_var']));
    });

    it('rejects missing required placeholders and names them', async () => {
      await expect(
        target.createVersion(promptId, { template: 'Hi {{business_name}}' }, tenantUser)
      ).rejects.toThrow(
        MESSAGES.PROMPTS.MISSING_VARIABLE(['reviewer_name', 'rating', 'review_text'])
      );
    });

    /** Regression: without a machine-readable code the frontend could only show a generic "Could not save" toast. */
    it('tags the unknown-placeholder rejection with a machine-readable code', async () => {
      try {
        await target.createVersion(promptId, { template: 'Hi {{unknown_var}}' }, tenantUser);
        throw new Error('expected createVersion to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(UnknownPlaceholderException);
        expect((error as UnknownPlaceholderException).getResponse()).toMatchObject({
          code: PROMPT_ERROR_CODES.UNKNOWN_PLACEHOLDER,
        });
      }
    });

    it('tags the missing-placeholder rejection with a machine-readable code', async () => {
      try {
        await target.createVersion(promptId, { template: 'Hi {{business_name}}' }, tenantUser);
        throw new Error('expected createVersion to reject');
      } catch (error) {
        expect(error).toBeInstanceOf(MissingPlaceholderException);
        expect((error as MissingPlaceholderException).getResponse()).toMatchObject({
          code: PROMPT_ERROR_CODES.MISSING_PLACEHOLDER,
        });
      }
    });

    it('accepts spaced placeholders', async () => {
      promptsDbService.getCurrentVersion.mockResolvedValue(currentVersion);
      promptsDbService.appendVersion.mockResolvedValue({
        id: 'ver-2',
        version: 2,
        template: 'Thanks {{ business_name }} {{reviewer_name}} {{rating}} {{review_text}}',
        createdAt: new Date('2026-09-04T12:00:00Z'),
        createdByUserId: tenantUser.id,
      });
      promptsDbService.countVersions.mockResolvedValue(2);

      await target.createVersion(
        promptId,
        {
          template: 'Thanks {{ business_name }} {{reviewer_name}} {{rating}} {{review_text}}',
        },
        tenantUser
      );

      expect(promptsDbService.appendVersion).toHaveBeenCalled();
    });

    it('returns 404 when the prompt is not in the tenant', async () => {
      promptsDbService.getCurrentVersion.mockResolvedValue(null);

      await expect(
        target.createVersion(promptId, { template: REQUIRED_TEMPLATE }, tenantUser)
      ).rejects.toBeInstanceOf(PromptNotFoundException);
    });

    it('rejects an unchanged template after sanitization', async () => {
      promptsDbService.getCurrentVersion.mockResolvedValue({
        ...currentVersion,
        template: 'Hello {{business_name}} {{reviewer_name}} {{rating}} {{review_text}}\r\n',
      });

      await expect(
        target.createVersion(promptId, { template: `${REQUIRED_TEMPLATE}\n` }, tenantUser)
      ).rejects.toThrow(MESSAGES.PROMPTS.TEMPLATE_UNCHANGED);
    });

    it('appends a version using the JWT user id and sanitized template', async () => {
      const nextTemplate = 'Thanks {{business_name}} {{reviewer_name}} {{rating}} {{review_text}}';
      promptsDbService.getCurrentVersion.mockResolvedValue(currentVersion);
      promptsDbService.appendVersion.mockResolvedValue({
        id: 'ver-2',
        version: 2,
        template: nextTemplate,
        createdAt: new Date('2026-09-04T12:00:00Z'),
        createdByUserId: tenantUser.id,
      });
      promptsDbService.countVersions.mockResolvedValue(2);

      const result = await target.createVersion(promptId, { template: nextTemplate }, tenantUser);

      expect(result.version.version).toBe(2);
      expect(result.versionCount).toBe(2);
      expect(promptsDbService.appendVersion).toHaveBeenCalledWith({
        promptId,
        tenantId: tenantUser.tenantId,
        template: nextTemplate,
        createdByUserId: tenantUser.id,
      });
    });

    it('maps a unique-violation on retry exhaustion to VERSION_CONFLICT', async () => {
      promptsDbService.getCurrentVersion.mockResolvedValue(currentVersion);
      promptsDbService.appendVersion.mockRejectedValue(
        Object.assign(new Error('dup'), { code: '23505' })
      );

      await expect(
        target.createVersion(
          promptId,
          {
            template: 'New {{business_name}} {{reviewer_name}} {{rating}} {{review_text}}',
          },
          tenantUser
        )
      ).rejects.toBeInstanceOf(PromptVersionConflictException);
    });
  });

  describe('updateTone', () => {
    it('updates the live tone column', async () => {
      promptsDbService.updateTone.mockResolvedValue({
        id: promptId,
        tenantId: tenantUser.tenantId,
        category: 'positive',
        name: 'Positive review reply',
        description: null,
        tone: 'friendly',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await target.updateTone(promptId, 'friendly', tenantUser);
      expect(result.tone).toBe('friendly');
      expect(promptsDbService.updateTone).toHaveBeenCalledWith({
        promptId,
        tenantId: tenantUser.tenantId,
        tone: 'friendly',
      });
    });

    /** Tone is prompt configuration too; gating only `createVersion` left Free a cheaper route to reshape AI output. */
    it('rejects with CustomPromptsNotOnPlanException when the plan disallows custom prompts', async () => {
      billingEntitlementsService.canEditCustomPrompt.mockResolvedValue(false);

      await expect(target.updateTone(promptId, 'friendly', tenantUser)).rejects.toThrow(
        CustomPromptsNotOnPlanException
      );

      expect(billingEntitlementsService.canEditCustomPrompt).toHaveBeenCalledWith(
        tenantUser.tenantId
      );
      expect(promptsDbService.updateTone).not.toHaveBeenCalled();
    });
  });

  describe('getVersionStats', () => {
    // `null` means the prompt/version doesn't exist; one repository call answers both existence and stats.
    it('throws PromptVersionNotFoundException (not PromptNotFoundException) when ?version=N does not exist for this tenant', async () => {
      reviewSyncDbService.getPromptVersionStats.mockResolvedValue(null);

      await expect(target.getVersionStats(promptId, 1, tenantUser)).rejects.toBeInstanceOf(
        PromptVersionNotFoundException
      );
      expect(reviewSyncDbService.getPromptVersionStats).toHaveBeenCalledWith({
        tenantId: tenantUser.tenantId,
        promptId,
        version: 1,
      });
    });

    it('returns all-zero/null stats for a version with no drafts', async () => {
      reviewSyncDbService.getPromptVersionStats.mockResolvedValue({
        totalGenerated: 0,
        approvedCount: 0,
        approvedEditedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
        supersededCount: 0,
        averageDecisionMinutes: null,
      });

      const result = await target.getVersionStats(promptId, currentVersion.version, tenantUser);

      expect(result).toEqual({
        totalGenerated: 0,
        approvedCount: 0,
        approvedAsIsCount: 0,
        approvedEditedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
        supersededCount: 0,
        averageDecisionMinutes: null,
      });
    });

    it('derives approvedAsIsCount from approvedCount and approvedEditedCount for a mix of outcomes', async () => {
      reviewSyncDbService.getPromptVersionStats.mockResolvedValue({
        totalGenerated: 20,
        approvedCount: 12,
        approvedEditedCount: 5,
        rejectedCount: 3,
        pendingCount: 4,
        supersededCount: 1,
        averageDecisionMinutes: 18.25,
      });

      const result = await target.getVersionStats(promptId, currentVersion.version, tenantUser);

      expect(result).toEqual({
        totalGenerated: 20,
        approvedCount: 12,
        approvedAsIsCount: 7,
        approvedEditedCount: 5,
        rejectedCount: 3,
        pendingCount: 4,
        supersededCount: 1,
        averageDecisionMinutes: 18.25,
      });
      expect(reviewSyncDbService.getPromptVersionStats).toHaveBeenCalledWith({
        tenantId: tenantUser.tenantId,
        promptId,
        version: currentVersion.version,
      });
    });

    it('throws PromptNotFoundException when version is omitted and the prompt itself does not exist', async () => {
      reviewSyncDbService.getPromptVersionStats.mockResolvedValue(null);

      await expect(target.getVersionStats(promptId, undefined, tenantUser)).rejects.toBeInstanceOf(
        PromptNotFoundException
      );
      expect(reviewSyncDbService.getPromptVersionStats).toHaveBeenCalledWith({
        tenantId: tenantUser.tenantId,
        promptId,
      });
    });

    it('aggregates across every version when version is omitted, without passing version through', async () => {
      reviewSyncDbService.getPromptVersionStats.mockResolvedValue({
        totalGenerated: 50,
        approvedCount: 30,
        approvedEditedCount: 10,
        rejectedCount: 8,
        pendingCount: 10,
        supersededCount: 2,
        averageDecisionMinutes: 15,
      });

      const result = await target.getVersionStats(promptId, undefined, tenantUser);

      expect(result.approvedAsIsCount).toBe(20);
      expect(reviewSyncDbService.getPromptVersionStats).toHaveBeenCalledWith({
        tenantId: tenantUser.tenantId,
        promptId,
      });
      expect(reviewSyncDbService.getPromptVersionStats).not.toHaveBeenCalledWith(
        expect.objectContaining({ version: expect.anything() })
      );
    });
  });

  describe('getVersionStatsBatch', () => {
    it('makes exactly one call to the DB service for every pair given', async () => {
      reviewSyncDbService.getPromptVersionStatsBatch.mockResolvedValue([
        {
          promptId,
          version: 3,
          stats: {
            totalGenerated: 18,
            approvedCount: 14,
            approvedEditedCount: 3,
            rejectedCount: 2,
            pendingCount: 2,
            supersededCount: 0,
            averageDecisionMinutes: 12.4,
          },
        },
        {
          promptId: 'other-prompt',
          version: 1,
          stats: {
            totalGenerated: 0,
            approvedCount: 0,
            approvedEditedCount: 0,
            rejectedCount: 0,
            pendingCount: 0,
            supersededCount: 0,
            averageDecisionMinutes: null,
          },
        },
      ]);

      const result = await target.getVersionStatsBatch(
        [
          { promptId, version: 3 },
          { promptId: 'other-prompt', version: 1 },
        ],
        tenantUser
      );

      expect(reviewSyncDbService.getPromptVersionStatsBatch).toHaveBeenCalledTimes(1);
      expect(reviewSyncDbService.getPromptVersionStatsBatch).toHaveBeenCalledWith({
        tenantId: tenantUser.tenantId,
        pairs: [
          { promptId, version: 3 },
          { promptId: 'other-prompt', version: 1 },
        ],
      });
      expect(result.results).toHaveLength(2);
      expect(result.results[0]).toEqual({
        promptId,
        version: 3,
        stats: {
          totalGenerated: 18,
          approvedCount: 14,
          approvedAsIsCount: 11,
          approvedEditedCount: 3,
          rejectedCount: 2,
          pendingCount: 2,
          supersededCount: 0,
          averageDecisionMinutes: 12.4,
        },
      });
      expect(result.results[1]).toEqual({
        promptId: 'other-prompt',
        version: 1,
        stats: {
          totalGenerated: 0,
          approvedCount: 0,
          approvedAsIsCount: 0,
          approvedEditedCount: 0,
          rejectedCount: 0,
          pendingCount: 0,
          supersededCount: 0,
          averageDecisionMinutes: null,
        },
      });
    });
  });
});
