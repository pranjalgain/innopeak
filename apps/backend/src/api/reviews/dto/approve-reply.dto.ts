import {
  HAS_VISIBLE_TEXT,
  REPLY_NEEDS_TEXT_MESSAGE,
} from '@common/constants/visible-text.constants';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ApproveReplyDto {
  @ApiPropertyOptional({
    description:
      "Edited reply text. Omit to approve the draft as-is. If different from the AI draft's " +
      'original content, the response is recorded as human_edited.',
    example: 'Thank you so much, Marta — we hope to see you again soon!',
    maxLength: 4096,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  // Google's own limit for a review reply; a longer text was accepted here and then refused when it was posted.
  @MaxLength(4096)
  @Matches(HAS_VISIBLE_TEXT, { message: REPLY_NEEDS_TEXT_MESSAGE })
  content?: string;
}
