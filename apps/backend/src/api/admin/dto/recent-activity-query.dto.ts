import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Size of the Overview page's glance feed: the newest `limit` entries of the activity log.
export const ADMIN_ACTIVITY_LIMIT_DEFAULT = 8;
export const ADMIN_ACTIVITY_LIMIT_MAX = 50;

export class RecentActivityQueryDto {
  @ApiPropertyOptional({
    example: ADMIN_ACTIVITY_LIMIT_DEFAULT,
    default: ADMIN_ACTIVITY_LIMIT_DEFAULT,
    minimum: 1,
    maximum: ADMIN_ACTIVITY_LIMIT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_ACTIVITY_LIMIT_MAX)
  limit: number = ADMIN_ACTIVITY_LIMIT_DEFAULT;
}
