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
    maxLength: 5000,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @Matches(HAS_VISIBLE_TEXT, { message: REPLY_NEEDS_TEXT_MESSAGE })
  content?: string;
}
