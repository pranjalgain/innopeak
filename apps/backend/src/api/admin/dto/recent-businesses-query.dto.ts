import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const ADMIN_RECENT_BUSINESSES_LIMIT_DEFAULT = 5;
export const ADMIN_RECENT_BUSINESSES_LIMIT_MAX = 50;

export class RecentBusinessesQueryDto {
  @ApiPropertyOptional({
    example: ADMIN_RECENT_BUSINESSES_LIMIT_DEFAULT,
    default: ADMIN_RECENT_BUSINESSES_LIMIT_DEFAULT,
    minimum: 1,
    maximum: ADMIN_RECENT_BUSINESSES_LIMIT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_RECENT_BUSINESSES_LIMIT_MAX)
  limit: number = ADMIN_RECENT_BUSINESSES_LIMIT_DEFAULT;
}
