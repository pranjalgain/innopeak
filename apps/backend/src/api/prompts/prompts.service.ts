import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
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

import type { AuthUser } from '../auth/types/auth-user.type';

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(
    private readonly promptsDbService: PromptsDbService,
    private readonly reviewSyncDbService: ReviewSyncDbService
  ) {}

  async list(user: AuthUser, includeHistory: boolean | undefined): Promise<PromptListResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.PROMPTS.TENANT_ONLY);
    const rows = await this.promptsDbService.listWithVersions(tenantUser.tenantId);
    const embedHistory = includeHistory ?? false;

    // A prompt with no versions is skipped, not fatal. `prompts` and `prompt_versions` are
    // separate tables with nothing forcing a version to exist, so one malformed row would
    // otherwise 404 the entire listing and take every healthy prompt down with it.
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

  async updateTone(
    promptId: string,
    tone: PromptToneValue,
    user: AuthUser
  ): Promise<UpdatePromptToneResponseDto> {
    const tenantUser = requireTenantUser(user, MESSAGES.PROMPTS.TENANT_ONLY);
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

    // A single query answers both "does this exist" and "what are its stats" — see
    // `ReviewsReadRepository.getPromptVersionStats`'s own doc comment for how. `null` here means
    // the prompt (version omitted) or that specific version (version given) doesn't exist for this
    // tenant; which exception to throw still depends on which of the two was being looked up.
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

    // Arithmetic, not a query: `approvedAsIsCount` is never stored or asked of the DB directly,
    // it's just what's left of `approvedCount` once the edited ones are subtracted out.
    const approvedAsIsCount = stats.approvedCount - stats.approvedEditedCount;

    return PromptVersionStatsResponseDto.from({ ...stats, approvedAsIsCount });
  }

  /**
   * The batch counterpart to `getVersionStats` — one grouped query for every (promptId, version)
   * pair a caller asks for, rather than a request per pair (`usePromptAnalytics`'s N+1 fix). No
   * per-pair existence check: a pair naming a prompt/version this tenant doesn't have simply comes
   * back all-zero (`ReviewsReadRepository.getPromptVersionStatsBatch`'s tenant-scoped join can
   * never match rows for another tenant's prompt in the first place), which keeps this a single
   * round trip instead of N existence checks plus one aggregate query.
   */
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
