import { Public } from '@auth/decorators/public.decorator';
import { MESSAGES } from '@common/constants/messages.constants';
import type { ApiResponse } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { AdminBusinessesDbService } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { Body, Controller, Logger, NotFoundException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AiReplyGenerationService } from './ai-reply-generation.service';
import { GenerateReplyDryRunResponseDto } from './dto/generate-reply-dry-run-response.dto';
import { GenerateReplyDryRunDto } from './dto/generate-reply-dry-run.dto';
import { ApiGenerateReplyDryRun } from './swagger/ai.swagger';

/** Unauthenticated for local testing; with no JWT to read `tenantId` from, the caller names one (see `GenerateReplyDryRunDto.tenantId`). */
@Controller({ path: RouteNames.AI, version: '1' })
@ApiTags('AI')
@Public()
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiReplyGenerationService: AiReplyGenerationService,
    private readonly adminBusinessesDbService: AdminBusinessesDbService
  ) {}

  @Post(RouteNames.AI_DRY_RUN)
  // Every call is a billable AI provider request; keep tight even with no per-caller identity to key on.
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @ApiGenerateReplyDryRun()
  async generateDryRunReply(
    @Body() dto: GenerateReplyDryRunDto
  ): Promise<ApiResponse<GenerateReplyDryRunResponseDto>> {
    const tenantId = await this.resolveTenantId(dto.tenantId);

    const result = await this.aiReplyGenerationService.generateDryRunReply(
      dto.toServiceInput(),
      tenantId
    );
    return ResponseUtil.success(
      GenerateReplyDryRunResponseDto.from(result),
      MESSAGES.AI.DRY_RUN_GENERATED
    );
  }

  /** `findRecent(1)`, not `findAll()`: this route is public, and `findAll` runs the expensive Super Admin listing
   *  per unauthenticated request just to read one id; the SQL LIMIT bounds that. */
  private async resolveTenantId(requested: string | undefined): Promise<string> {
    if (requested !== undefined) {
      return requested;
    }

    const tenants = await this.adminBusinessesDbService.findRecent(1);
    const first = tenants[0];
    if (first === undefined) {
      throw new NotFoundException({
        message: 'No tenant exists to generate against. Create one, or pass an explicit tenantId.',
        code: 'AI_DRY_RUN_NO_TENANT',
      });
    }

    // Not the tenant's name: this fires on every unauthenticated call omitting tenantId, and a customer's name
    // shouldn't reach the log because of an unsigned request.
    this.logger.warn(`No tenantId given — resolved to tenant ${first.id}.`);
    return first.id;
  }
}
