import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import {
  ADMIN_LIST_PAGE_MAX,
  ADMIN_LIST_PAGE_SIZE_DEFAULT,
  ADMIN_LIST_PAGE_SIZE_MAX,
} from '../constants/admin-overview.constants';

export class ListAdminUsersQueryDto {
  @ApiPropertyOptional({
    example: 'jane',
    maxLength: 200,
    description: 'Case-insensitive substring match against the user name or their business name.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, description: '1-based page number.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_PAGE_MAX)
  page?: number;

  @ApiPropertyOptional({
    example: ADMIN_LIST_PAGE_SIZE_DEFAULT,
    minimum: 1,
    maximum: ADMIN_LIST_PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_LIST_PAGE_SIZE_MAX)
  pageSize?: number;
}
