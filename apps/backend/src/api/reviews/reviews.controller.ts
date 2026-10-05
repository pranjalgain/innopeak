import { CurrentUser } from '@auth/decorators/current-user.decorator';
import type { AuthUser } from '@auth/types/auth.type';
import { MESSAGES } from '@common/constants/messages.constants';
import { ApiResponse as ApiResponseDto } from '@common/dto/api-response';
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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApproveReplyDto } from './dto/approve-reply.dto';
import { CreateManualReplyDto } from './dto/create-manual-reply.dto';
import type {
  ManualReplyResponseDto,
  PostQueuedResponseDto,
  PostStatusResponseDto,
  RetryPostResponseDto,
} from './dto/post-actions.dto';
import { ListReviewsQueryDto } from './dto/review-request.dto';
import type {
  ReviewDetailResponseDto,
  ReviewListResponseDto,
  ReviewResponseItemDto,
} from './dto/review-response.dto';
import { ReviewsService } from './reviews.service';
import {
  ApiApproveReply,
  ApiCreateManualReply,
  ApiGetPostStatus,
  ApiGetReview,
  ApiListReviews,
  ApiPostResponse,
  ApiRejectReply,
  ApiRetryPost,
} from './swagger/reviews.swagger';

/**
 * `approve`/`reject` persist a decision on an AI-generated (or imported/manual) draft — who
 * decided it, and when. They do NOT post the reply to Google Business Profile: actually publishing
 * is a distinct, not-yet-built step (blocked on GBP write-API access), so an approved response
 * lands at `status = 'approved'`, never `'posted'`, here.
 */
@Controller({ path: RouteNames.REVIEWS, version: '1' })
@ApiTags('Reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiListReviews()
  async listReviews(
    @CurrentUser() user: AuthUser,
    @Query() query: ListReviewsQueryDto
  ): Promise<ApiResponseDto<ReviewListResponseDto>> {
    const response = await this.reviewsService.listReviews({
      user,
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
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string
  ): Promise<ApiResponseDto<ReviewDetailResponseDto>> {
    const response = await this.reviewsService.getReview({ user, reviewId });
    return ResponseUtil.success(response, undefined, HttpStatus.OK);
  }

  @Post(RouteNames.REVIEW_RESPONSE_APPROVE)
  @HttpCode(HttpStatus.OK)
  @ApiApproveReply()
  async approveReply(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string,
    @Body() dto: ApproveReplyDto
  ): Promise<ApiResponseDto<ReviewResponseItemDto>> {
    const response = await this.reviewsService.approveReply({
      user,
      reviewId,
      responseId,
      content: dto.content,
    });
    return ResponseUtil.success(response, MESSAGES.REVIEWS.RESPONSE_APPROVED, HttpStatus.OK);
  }

  @Post(RouteNames.REVIEW_RESPONSE_REJECT)
  @HttpCode(HttpStatus.OK)
  @ApiRejectReply()
  async rejectReply(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string
  ): Promise<ApiResponseDto<ReviewResponseItemDto>> {
    const response = await this.reviewsService.rejectReply({ user, reviewId, responseId });
    return ResponseUtil.success(response, MESSAGES.REVIEWS.RESPONSE_REJECTED, HttpStatus.OK);
  }

  @Post(RouteNames.REVIEW_RESPONSE_RETRY_POST)
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiRetryPost()
  async retryPost(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string
  ): Promise<ApiResponseDto<RetryPostResponseDto>> {
    const response = await this.reviewsService.retryPost({ user, reviewId, responseId });
    return ResponseUtil.success(response, MESSAGES.REVIEWS.RESPONSE_RETRY_QUEUED, HttpStatus.OK);
  }

  @Post(RouteNames.REVIEW_RESPONSE_POST)
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @ApiPostResponse()
  async postResponse(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string
  ): Promise<ApiResponseDto<PostQueuedResponseDto>> {
    const response = await this.reviewsService.postResponse({ user, reviewId, responseId });
    return ResponseUtil.success(response, MESSAGES.REVIEWS.RESPONSE_POST_QUEUED, HttpStatus.OK);
  }

  @Get(RouteNames.REVIEW_RESPONSE_POST_STATUS)
  @Throttle({ short: { limit: 60, ttl: 60000 } })
  @ApiGetPostStatus()
  async getPostStatus(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string
  ): Promise<ApiResponseDto<PostStatusResponseDto>> {
    const response = await this.reviewsService.getPostStatus({ user, reviewId, responseId });
    return ResponseUtil.success(response, MESSAGES.REVIEWS.POST_STATUS_RETRIEVED, HttpStatus.OK);
  }

  @Post(RouteNames.REVIEW_RESPONSES)
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @ApiCreateManualReply()
  async createManualReply(
    @CurrentUser() user: AuthUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: CreateManualReplyDto
  ): Promise<ApiResponseDto<ManualReplyResponseDto>> {
    const response = await this.reviewsService.createManualReply({
      user,
      reviewId,
      content: dto.content,
    });
    return ResponseUtil.success(
      response,
      MESSAGES.REVIEWS.MANUAL_REPLY_CREATED,
      HttpStatus.CREATED
    );
  }
}
