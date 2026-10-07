import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  NOTIFICATIONS_LIMIT_DEFAULT,
  NOTIFICATIONS_LIMIT_MAX,
  NOTIFICATIONS_OFFSET_MAX,
} from '../constants/notifications.constants';

/** `offset`/`limit`, not this app's usual `page`/`pageSize`, to match the frontend's `list(offset, limit)` call. */
export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    example: 0,
    minimum: 0,
    maximum: NOTIFICATIONS_OFFSET_MAX,
    default: 0,
    description: 'The count of items already loaded, not a page index.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  // `@IsInt()` accepts `1e20`, which reaches Postgres as an out-of-range bigint (a 500, not a 400).
  @Max(NOTIFICATIONS_OFFSET_MAX)
  offset?: number;

  @ApiPropertyOptional({
    example: NOTIFICATIONS_LIMIT_DEFAULT,
    minimum: 1,
    maximum: NOTIFICATIONS_LIMIT_MAX,
    default: NOTIFICATIONS_LIMIT_DEFAULT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATIONS_LIMIT_MAX)
  limit?: number;
}
