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

/**
 * `@Public()` — no token required. Removed on request, for local testing without having to log
 * in first: this route reads a tenant's prompt configuration and calls a real, billable AI
 * provider, so without a JWT to read `tenantId` off, the caller names one directly (see
 * `GenerateReplyDryRunDto.tenantId`).
 */
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
  // Every call here is a real, billable AI provider request, not a database write — worth
  // keeping tight even with no per-caller identity to key a limit on.
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

  /**
   * `findRecent(1)` — not `findAll()`. This route is `@Public()`, so every unauthenticated
   * request that omits `tenantId` used to run the Super Admin Businesses listing (every tenant,
   * ~5 correlated subqueries per row: owner name, owner email, user count, the latest-connection
   * pair) to extract exactly one field, `id`. `findRecent(1)` runs the same per-row cost but
   * bounded by a real SQL `LIMIT` instead of scanning every tenant — an unauthenticated,
   * per-IP-only-throttled amplification vector against the primary DB otherwise.
   */
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

    // Not the tenant's name: this line fires on every unauthenticated call that omits
    // tenantId, and a real customer's name has no reason to land in the application log because
    // of a request nobody signed.
    this.logger.warn(`No tenantId given — resolved to tenant ${first.id}.`);
    return first.id;
  }
}
