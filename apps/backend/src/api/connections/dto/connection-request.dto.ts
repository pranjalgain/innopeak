import { LocationStatus } from '@common/enums/location-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

import {
  SYNC_RUNS_PAGE_SIZE_DEFAULT,
  SYNC_RUNS_PAGE_SIZE_MAX,
} from '../constants/connections.constants';
import { ReturnTo } from '../enums/return-to.enum';

export class AuthorizeQueryDto {
  @ApiPropertyOptional({
    example: ReturnTo.ONBOARDING,
    enum: ReturnTo,
    description:
      'Which frontend screen to return to. A key from a server-side allowlist, never a URL — ' +
      'accepting a raw URL here would make the OAuth callback an open redirect.',
  })
  @IsOptional()
  @IsEnum(ReturnTo, {
    message: `returnTo must be one of: ${Object.values(ReturnTo).join(', ')}`,
  })
  returnTo?: ReturnTo;
}

export class ConfirmLocationDto {
  @ApiPropertyOptional({
    example: 'locations/12345678901234567890',
    description:
      "The provider's own location identifier, taken from GET /v1/connections/google/" +
      'available-locations. Re-validated server-side against the provider — never trusted from ' +
      'the client, since an arbitrary value would create a location row no poll can resolve.',
  })
  @IsString()
  @Length(1, 255)
  externalLocationId!: string;
}

export class ListLocationsQueryDto {
  @ApiPropertyOptional({ example: LocationStatus.ACTIVE, enum: LocationStatus })
  @IsOptional()
  @IsEnum(LocationStatus)
  status?: LocationStatus;
}

export class ListSyncRunsQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: SYNC_RUNS_PAGE_SIZE_DEFAULT,
    minimum: 1,
    maximum: SYNC_RUNS_PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SYNC_RUNS_PAGE_SIZE_MAX)
  pageSize?: number;

  @ApiPropertyOptional({ example: SyncRunStatus.ERROR, enum: SyncRunStatus })
  @IsOptional()
  @IsEnum(SyncRunStatus)
  status?: SyncRunStatus;

  @ApiPropertyOptional({ example: SyncTrigger.BACKFILL, enum: SyncTrigger })
  @IsOptional()
  @IsEnum(SyncTrigger)
  trigger?: SyncTrigger;
}

export class LocationIdParamDto {
  @ApiPropertyOptional({ example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4' })
  @IsUUID()
  @Transform(({ value }: { value: unknown }) => String(value))
  locationId!: string;
}
