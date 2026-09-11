import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import { PromptsDbService } from '@db/repositories/prompts/prompts.db-service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PromptsService } from './prompts.service';
import type { PromptVersionRecord } from './types/prompt.type';

import { JwtTokenType } from '../auth/enums/jwt-token-type.enum';
import type { TenantAuthUser } from '../auth/types/auth-user.type';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [PromptsService, { provide: PromptsDbService, useValue: promptsDbService }],
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
      ).rejects.toBeInstanceOf(NotFoundException);
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
      expect(promptsDbService.appendVersion).toHaveBeenCalledWith(
        promptId,
        tenantUser.tenantId,
        nextTemplate,
        tenantUser.id
      );
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
      ).rejects.toBeInstanceOf(ConflictException);
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
      expect(promptsDbService.updateTone).toHaveBeenCalledWith(
        promptId,
        tenantUser.tenantId,
        'friendly'
      );
    });
  });
});
