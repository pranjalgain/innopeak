import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** Sane cap on one batch call — bounds both the request payload and the `OR` clause the
 *  repository builds from it. Comfortably above any realistic prompt-list page size. */
export const PROMPT_STATS_BATCH_MAX_PAIRS = 100;

export class PromptStatsBatchPairDto {
  @ApiProperty({ example: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011' })
  @IsUUID()
  promptId!: string;

  @ApiProperty({ example: 3, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class GetPromptStatsBatchDto {
  @ApiProperty({
    type: [PromptStatsBatchPairDto],
    description:
      `Every (promptId, version) pair to aggregate stats for, in one request — at most ` +
      `${PROMPT_STATS_BATCH_MAX_PAIRS}. A pair with no matching review_responses rows (or that ` +
      `does not exist) comes back with all-zero/null stats rather than an error.`,
    example: [
      { promptId: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0011', version: 3 },
      { promptId: '0190f4a1-7c33-7e51-9a02-6d1b8f4c0022', version: 1 },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(PROMPT_STATS_BATCH_MAX_PAIRS, {
    message: `pairs must contain at most ${PROMPT_STATS_BATCH_MAX_PAIRS} entries`,
  })
  @ValidateNested({ each: true })
  @Type(() => PromptStatsBatchPairDto)
  pairs!: PromptStatsBatchPairDto[];
}
