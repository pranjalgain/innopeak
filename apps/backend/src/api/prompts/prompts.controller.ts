import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { UserRole } from '@auth/enums/user-role.enum';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CreatePromptVersionDto } from './dto/create-prompt-version.dto';
import { GetPromptStatsBatchDto } from './dto/get-prompt-stats-batch.dto';
import { GetPromptStatsQueryDto } from './dto/get-prompt-stats-query.dto';
import { ListPromptsQueryDto } from './dto/list-prompts-query.dto';
import {
  CreatePromptVersionResponseDto,
  PromptListResponseDto,
  PromptStatsBatchResponseDto,
  PromptVersionStatsResponseDto,
  UpdatePromptToneResponseDto,
} from './dto/prompt-response.dto';
import { UpdatePromptToneDto } from './dto/update-prompt-tone.dto';
import { PromptsService } from './prompts.service';
import {
  ApiCreatePromptVersion,
  ApiGetPromptStats,
  ApiGetPromptStatsBatch,
  ApiListPrompts,
  ApiUpdatePromptTone,
} from './swagger/prompts.swagger';

import type { AuthUser } from '../auth/types/auth-user.type';

@Controller({ path: RouteNames.PROMPTS, version: '1' })
@ApiTags('Prompts')
@Roles(UserRole.OWNER)
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Get()
  @ApiListPrompts()
  async list(
    @Query() query: ListPromptsQueryDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<PromptListResponseDto>> {
    const result = await this.promptsService.list(user, query.includeHistory);
    return ResponseUtil.success(result, MESSAGES.PROMPTS.LISTED);
  }

  @Post(':promptId/versions')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiCreatePromptVersion()
  async createVersion(
    @Param('promptId', ParseUUIDPipe) promptId: string,
    @Body() dto: CreatePromptVersionDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<CreatePromptVersionResponseDto>> {
    const result = await this.promptsService.createVersion(promptId, dto, user);
    return ResponseUtil.success(result, MESSAGES.PROMPTS.VERSION_CREATED, HttpStatus.CREATED);
  }

  @Put(':promptId/tone')
  @ApiUpdatePromptTone()
  async updateTone(
    @Param('promptId', ParseUUIDPipe) promptId: string,
    @Body() dto: UpdatePromptToneDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<UpdatePromptToneResponseDto>> {
    const result = await this.promptsService.updateTone(promptId, dto.tone, user);
    return ResponseUtil.success(result, MESSAGES.PROMPTS.TONE_UPDATED);
  }

  @Get(RouteNames.PROMPT_STATS)
  @ApiGetPromptStats()
  async getVersionStats(
    @Param('promptId', ParseUUIDPipe) promptId: string,
    @Query() query: GetPromptStatsQueryDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<PromptVersionStatsResponseDto>> {
    const result = await this.promptsService.getVersionStats(promptId, query.version, user);
    return ResponseUtil.success(result, MESSAGES.PROMPTS.STATS_RETRIEVED);
  }

  @Post(RouteNames.PROMPT_STATS_BATCH)
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @ApiGetPromptStatsBatch()
  async getVersionStatsBatch(
    @Body() dto: GetPromptStatsBatchDto,
    @CurrentUser() user: AuthUser
  ): Promise<ApiResponse<PromptStatsBatchResponseDto>> {
    const result = await this.promptsService.getVersionStatsBatch(dto.pairs, user);
    return ResponseUtil.success(result, MESSAGES.PROMPTS.STATS_BATCH_RETRIEVED);
  }
}
