import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { MESSAGES } from '@common/constants/messages.constants';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { PromptsDbService } from '@db/repositories/prompts/prompts.db-service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import {
  findMissingRequiredPromptPlaceholders,
  findUnknownPromptPlaceholders,
  type PromptToneValue,
  sanitizePromptTemplate,
} from './constants/prompts.constants';
import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import {
  CreatePromptVersionResponseDto,
  PromptDto,
  PromptListResponseDto,
  PromptVersionDto,
  UpdatePromptToneResponseDto,
} from './dto/prompt-response.dto';
import type { AppendedPromptVersion } from './types/prompt.type';
import { toPromptDto } from './utils/prompt-response.util';

import type { AuthUser } from '../auth/types/auth-user.type';

@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(private readonly promptsDbService: PromptsDbService) {}

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
      throw new BadRequestException(MESSAGES.PROMPTS.UNKNOWN_VARIABLE(unknown));
    }

    const missing = findMissingRequiredPromptPlaceholders(template);
    if (missing.length > 0) {
      throw new BadRequestException(MESSAGES.PROMPTS.MISSING_VARIABLE(missing));
    }

    const current = await this.promptsDbService.getCurrentVersion(promptId, tenantUser.tenantId);
    if (current === null) {
      throw new NotFoundException(MESSAGES.PROMPTS.NOT_FOUND);
    }

    if (template === sanitizePromptTemplate(current.template).trim()) {
      throw new ConflictException(MESSAGES.PROMPTS.TEMPLATE_UNCHANGED);
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
        throw new ConflictException(MESSAGES.PROMPTS.VERSION_CONFLICT);
      }
      throw error;
    }

    if (appended === null) {
      throw new NotFoundException(MESSAGES.PROMPTS.NOT_FOUND);
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
      throw new NotFoundException(MESSAGES.PROMPTS.NOT_FOUND);
    }
    return UpdatePromptToneResponseDto.from(updated);
  }
}
