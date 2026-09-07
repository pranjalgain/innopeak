import { CurrentTenantUser } from '@auth/decorators/current-tenant-user.decorator';
import type { TenantAuthUser } from '@auth/types/auth-user.type';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
import { ResponseUtil } from '@common/helpers/response.utils';
import { RouteNames } from '@common/route-names';
import { Controller, Get, HttpStatus, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { ListReviewsQueryDto } from './dto/review-request.dto';
import type { ReviewDetailResponseDto, ReviewListResponseDto } from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';
import { ApiGetReview, ApiListReviews } from './swagger/reviews.swagger';

/**
 * Read-only. The write surface (approve/reject/manual/dismiss/retry-post) acts on AI-generated
 * drafts, and nothing generates drafts until the review-pipeline module ships — shipping those
 * routes now would mean endpoints whose only reachable input is a backfilled historical reply.
 */
@Controller({ path: RouteNames.REVIEWS, version: '1' })
@ApiTags('Reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiListReviews()
  async listReviews(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: ListReviewsQueryDto
  ): Promise<ApiResponseDto<ReviewListResponseDto>> {
    const response = await this.reviewsService.listReviews({
      tenantId: user.tenantId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      classification: query.classification,
      locationId: query.locationId,
      search: query.search,
    });

    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Get(RouteNames.REVIEW_BY_ID)
  @ApiGetReview()
  async getReview(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string
  ): Promise<ApiResponseDto<ReviewDetailResponseDto>> {
    const response = await this.reviewsService.getReview({ tenantId: user.tenantId, reviewId });
    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }
}
