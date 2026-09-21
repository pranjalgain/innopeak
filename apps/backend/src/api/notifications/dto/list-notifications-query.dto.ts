import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  NOTIFICATIONS_LIMIT_DEFAULT,
  NOTIFICATIONS_LIMIT_MAX,
  NOTIFICATIONS_OFFSET_MAX,
} from '../constants/notifications.constants';

/**
 * `offset`/`limit`, not this app's usual `page`/`pageSize` — see the API reference's own
 * "Corrected (implementation pass)" note: this has to match `notification.service.ts`'s real
 * `list(offset, limit)` call, verified directly against the frontend rather than assumed.
 */
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
  // Bounded as well as floored. `@IsInt()` accepts any integral double, `1e20` included, and an
  // offset that large reaches Postgres as an out-of-range bigint — a 500 where the validator was
  // supposed to answer 400. The cap is far beyond any real feed (NOTIFICATIONS_LIMIT_MAX per
  // page) and exists to bound the value, not to ration it.
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
