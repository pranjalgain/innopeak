import { ResponseSource } from '@common/enums/response-source.enum';
import { ResponseStatus } from '@common/enums/response-status.enum';
import { ResponseType } from '@common/enums/response-type.enum';
import { ReviewStatus } from '@common/enums/review-status.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ClientResponseStatus } from '../enums/client-response-status.enum';

/** Field is `retryQueuedAt`, as named in the documented API contract a client may depend on. */
export class RetryPostResponseDto {
  @ApiProperty({ example: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64' })
  id!: string;

  @ApiProperty({ example: ClientResponseStatus.APPROVED, enum: ClientResponseStatus })
  status!: ClientResponseStatus;

  @ApiPropertyOptional({ example: null, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ example: '2026-08-31T21:15:03.000Z' })
  retryQueuedAt!: string;
}

/** Response of the manual post trigger for the `auto_post_enabled = false` case; same shape as retry-post's. */
export class PostQueuedResponseDto {
  @ApiProperty({ example: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64' })
  id!: string;

  @ApiProperty({ example: ClientResponseStatus.APPROVED, enum: ClientResponseStatus })
  status!: ClientResponseStatus;

  @ApiProperty({ example: '2026-08-31T21:15:03.000Z' })
  postQueuedAt!: string;
}

export class PostStatusResponseDto {
  @ApiProperty({ example: '0190f3c1-2b44-7d10-8a03-1e5c7f9b2d64' })
  id!: string;

  @ApiProperty({ example: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22' })
  reviewId!: string;

  @ApiProperty({
    example: ResponseStatus.POST_FAILED,
    enum: ResponseStatus,
    description:
      'The raw seven-value response_status, not the four-value client projection used ' +
      'elsewhere in this module — a client that reads this route genuinely wants the delivery ' +
      'detail, including posted/post_failed/superseded.',
  })
  status!: ResponseStatus;

  @ApiPropertyOptional({
    example: null,
    nullable: true,
    description: "Non-null only for 'posted'.",
  })
  postedAt!: string | null;

  @ApiPropertyOptional({
    example: 'Google API returned 429 (quota exceeded) — retry scheduled',
    nullable: true,
    description: "Populated on 'post_failed'.",
  })
  errorMessage!: string | null;

  @ApiProperty({
    example: ReviewStatus.IN_REVIEW,
    enum: ReviewStatus,
    description:
      "The parent review's own status, which becomes 'responded' only once this response " +
      'reaches posted — included so a client polling this endpoint needs no second request to ' +
      'update the queue badge.',
  })
  reviewStatus!: ReviewStatus;
}

export class ManualReplyResponseDto {
  @ApiProperty({ example: '0190f3d4-6e01-7a92-b7c3-0f2a8d5b1e46' })
  id!: string;

  @ApiProperty({ example: '0190f3b2-7c41-7a1e-9f0a-3b6d5c8e1a22' })
  reviewId!: string;

  @ApiProperty({ example: ResponseType.ESCALATION_SNIPPET, enum: ResponseType })
  responseType!: ResponseType;

  @ApiProperty({ example: 'Marcus, I’ve read this and I’m sorry.' })
  content!: string;

  @ApiProperty({ example: ResponseSource.HUMAN_MANUAL, enum: ResponseSource })
  source!: ResponseSource;

  @ApiProperty({ example: ClientResponseStatus.APPROVED, enum: ClientResponseStatus })
  status!: ClientResponseStatus;

  @ApiPropertyOptional({ example: '0190f2b7-9d12-7e34-b501-8c3a5f7d2e19', nullable: true })
  createdByUserId!: string | null;

  @ApiPropertyOptional({ example: '0190f2b7-9d12-7e34-b501-8c3a5f7d2e19', nullable: true })
  approvedByUserId!: string | null;

  @ApiPropertyOptional({ example: '2026-08-31T20:31:09.000Z', nullable: true })
  decidedAt!: string | null;

  @ApiProperty({
    type: [String],
    example: ['0190f3c1-2b44-7d10-8a03-1e5c7f9b2d65'],
    description: 'Non-terminal siblings this manual reply superseded, in the same transaction.',
  })
  supersededResponseIds!: string[];

  @ApiProperty({ example: ReviewStatus.IN_REVIEW, enum: ReviewStatus })
  reviewStatus!: ReviewStatus;
}
