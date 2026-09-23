import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const ADMIN_NEEDS_ATTENTION_LIMIT_DEFAULT = 3;
export const ADMIN_NEEDS_ATTENTION_LIMIT_MAX = 50;

export class NeedsAttentionQueryDto {
  @ApiPropertyOptional({
    example: ADMIN_NEEDS_ATTENTION_LIMIT_DEFAULT,
    default: ADMIN_NEEDS_ATTENTION_LIMIT_DEFAULT,
    minimum: 1,
    maximum: ADMIN_NEEDS_ATTENTION_LIMIT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_NEEDS_ATTENTION_LIMIT_MAX)
  limit: number = ADMIN_NEEDS_ATTENTION_LIMIT_DEFAULT;
}
