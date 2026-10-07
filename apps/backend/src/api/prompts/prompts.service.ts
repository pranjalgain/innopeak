import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { CustomPromptsNotOnPlanException } from '@billing/exceptions/billing.exceptions';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { MESSAGES } from '@common/constants/messages.constants';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { PromptsDbService } from '@db/repositories/prompts/prompts.db-service';
import { ReviewSyncDbService } from '@db/repositories/review-sync/review-sync.db-service';
import { Injectable, Logger } from '@nestjs/common';

import {
  findMissingRequiredPromptPlaceholders,
  findUnknownPromptPlaceholders,
  type PromptToneValue,
  sanitizePromptTemplate,
} from './constants/prompts.constants';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import { PromptStatsBatchPairDto } from './dto/get-prompt-stats-batch.dto';
import {
  CreatePromptVersionResponseDto,
  PromptDto,
  PromptListResponseDto,
  PromptStatsBatchResponseDto,
  PromptVersionDto,
  PromptVersionStatsResponseDto,
  UpdatePromptToneResponseDto,
} from './dto/prompt-response.dto';
import {
  MissingPlaceholderException,
  PromptNotFoundException,
  PromptVersionConflictException,
  PromptVersionNotFoundException,
  TemplateUnchangedException,
  UnknownPlaceholderException,
} from './exceptions/prompts.exceptions';
import type { AppendedPromptVersion } from './types/prompt.type';
import { toPromptDto } from './utils/prompt-response.util';

import type { AuthUser } from '../auth/types/auth.type';

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    private readonly promptsDbService: PromptsDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService,
    private readonly billingEntitlementsService: BillingEntitlementsService
  ) {}

  async list(user: AuthUser, includeHistory: boolean | undefined): Promise<PromptListResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.PROMPTS.TENANT_ONLY);
    const rows = await this.promptsDbService.listWithVersions(tenantUser.tenantId);
    const embedHistory = includeHistory ?? false;

    // Skipped, not fatal: nothing forces a version to exist, so one malformed row would 404 the whole listing.
    const dtos: PromptDto[] = [];
    for (const row of rows) {
      const dto = toPromptDto(row, embedHistory);
      if (dto === null) {
        this.logger.warn(
          `Prompt ${row.prompt.id} (tenant ${tenantUser.tenantId}) has no versions; omitted from the listing.`
        );
        continue;
      }
      dtos.push(dto);
    }

    return PromptListResponseDto.from(dtos);
  }

  async createVersion(
    promptId: string,
    dto: CreatePromptVersionDto,
    user: AuthUser
  ): Promise<CreatePromptVersionResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.PROMPTS.TENANT_ONLY);

    // Plan gate runs before placeholder validation: Free may never author custom template text, valid or not.
    if (!(await this.billingEntitlementsService.canEditCustomPrompt(tenantUser.tenantId))) {
      throw new CustomPromptsNotOnPlanException();
    }

    const template = sanitizePromptTemplate(dto.template).trim();
    const unknown = findUnknownPromptPlaceholders(template);
    if (unknown.length > 0) {
      throw new UnknownPlaceholderException(MESSAGES.PROMPTS.UNKNOWN_VARIABLE(unknown));
    }

    const missing = findMissingRequiredPromptPlaceholders(template);
    if (missing.length > 0) {
      throw new MissingPlaceholderException(MESSAGES.PROMPTS.MISSING_VARIABLE(missing));
    }

    const current = await this.promptsDbService.getCurrentVersion(promptId, tenantUser.tenantId);
    if (current === null) {
      throw new PromptNotFoundException();
    }

    if (template === sanitizePromptTemplate(current.template).trim()) {
      throw new TemplateUnchangedException();
    }

    let appended: AppendedPromptVersion | null;
    try {
      appended = await this.promptsDbService.appendVersion({
        promptId,
        tenantId: tenantUser.tenantId,
        template,
        createdByUserId: tenantUser.id,
      });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new PromptVersionConflictException();
      }
      throw error;
    }

    if (appended === null) {
      throw new PromptNotFoundException();
    }

    const versionCount = await this.promptsDbService.countVersions(promptId, tenantUser.tenantId);
    const versionDto = PromptVersionDto.from({
      id: appended.id,
      promptId,
      version: appended.version,
      template: appended.template,
      createdAt: appended.createdAt,
      createdByUserId: appended.createdByUserId,
      createdByName: appended.createdByName,
    });

    return CreatePromptVersionResponseDto.from(promptId, versionDto, versionCount);
  }

  /** Gated on `customPromptsEnabled` like `createVersion`: tone is prompt configuration, so gating only the template editor left Free a cheaper route. */
  async updateTone(
    promptId: string,
    tone: PromptToneValue,
    user: AuthUser
  ): Promise<UpdatePromptToneResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.PROMPTS.TENANT_ONLY);

    if (!(await this.billingEntitlementsService.canEditCustomPrompt(tenantUser.tenantId))) {
      throw new CustomPromptsNotOnPlanException();
    }

    const updated = await this.promptsDbService.updateTone({
      promptId,
      tenantId: tenantUser.tenantId,
      tone,
    });
    if (updated === null) {
      throw new PromptNotFoundException();
    }
    return UpdatePromptToneResponseDto.from(updated);
  }

  async getVersionStats(
    promptId: string,
    version: number | undefined,
    user: AuthUser
  ): Promise<PromptVersionStatsResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.PROMPTS.TENANT_ONLY);

    // `null` means the prompt (no version given) or that version doesn't exist for this tenant; which exception to
    // throw depends on which was looked up.
    const stats = await this.reviewSyncDbService.getPromptVersionStats({
      tenantId: tenantUser.tenantId,
      promptId,
      ...(version !== undefined ? { version } : {}),
    });

    if (stats === null) {
      throw version === undefined
        ? new PromptNotFoundException()
        : new PromptVersionNotFoundException();
    }

    // Derived, never stored: `approvedCount` minus the edited ones.
    const approvedAsIsCount = stats.approvedCount - stats.approvedEditedCount;

    return PromptVersionStatsResponseDto.from({ ...stats, approvedAsIsCount });
  }

  /** Batch form of `getVersionStats` in one grouped query. No existence check: unknown pairs come back all-zero (the tenant-scoped join never matches another tenant's rows). */
  async getVersionStatsBatch(
    pairs: PromptStatsBatchPairDto[],
    user: AuthUser
  ): Promise<PromptStatsBatchResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.PROMPTS.TENANT_ONLY);

    const results = await this.reviewSyncDbService.getPromptVersionStatsBatch({
      tenantId: tenantUser.tenantId,
      pairs: pairs.map(pair => ({ promptId: pair.promptId, version: pair.version })),
    });

    return PromptStatsBatchResponseDto.from(
      results.map(result => ({
        promptId: result.promptId,
        version: result.version,
        stats: {
          ...result.stats,
          approvedAsIsCount: result.stats.approvedCount - result.stats.approvedEditedCount,
        },
      }))
    );
  }
}
