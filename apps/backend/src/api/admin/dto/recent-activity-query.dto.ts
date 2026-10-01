import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// 8, not a smaller "just the log" figure: this is now the size of the *merged* feed
// (`AdminOverviewService.getRecentActivity`, real activity rows + synthesized business_joined
// entries), and `limit` rows are fetched from each source before merging — see
// `buildActivityFeed`'s own comment for why that's always enough.
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
