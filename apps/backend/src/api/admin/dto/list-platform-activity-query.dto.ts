import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import {
  ACTIVITY_LOG_PAGE_SIZE_DEFAULT,
  ACTIVITY_LOG_PAGE_SIZE_MAX,
} from '../constants/admin-overview.constants';

export class ListPlatformActivityQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: ACTIVITY_LOG_PAGE_SIZE_DEFAULT,
    minimum: 1,
    maximum: ACTIVITY_LOG_PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACTIVITY_LOG_PAGE_SIZE_MAX)
  pageSize?: number;

  @ApiPropertyOptional({
    example: PlatformActivityType.BUSINESS_SUSPENDED,
    enum: PlatformActivityType,
  })
  @IsOptional()
  @IsEnum(PlatformActivityType, {
    message: `type must be one of: ${Object.values(PlatformActivityType).join(', ')}`,
  })
  type?: PlatformActivityType;
}
