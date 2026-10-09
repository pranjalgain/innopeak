import { LocationStatus } from '@common/enums/location-status.enum';
import { SyncRunStatus } from '@common/enums/sync-run-status.enum';
import { SyncTrigger } from '@common/enums/sync-trigger.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

import {
  MAX_ACTIVE_LOCATIONS,
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
  @ApiProperty({
    type: String,
    isArray: true,
    example: ['locations/12345678901234567890', 'locations/98765432109876543210'],
    description:
      "The provider's own location identifiers, taken from GET /v1/connections/google/" +
      'available-locations. Re-validated server-side against the provider — never trusted from ' +
      'the client, since an arbitrary value would create a location row no poll can resolve.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(MAX_ACTIVE_LOCATIONS, {
    message: `externalLocationIds must contain at most ${MAX_ACTIVE_LOCATIONS} entries`,
  })
  @IsString({ each: true })
  @Length(1, 255, { each: true })
  externalLocationIds!: string[];
}

export class SetActiveLocationDto {
  @ApiProperty({
    example: '0190f4c2-1d55-7b09-8e42-6a3c9f01b7d4',
    description:
      "This tenant's internal `locations.id` (from GET /v1/connections/locations), not the " +
      'provider external id — becomes the business every member of the tenant sees on the ' +
      'Dashboard/Review Queue until an owner changes it again.',
  })
  @IsUUID()
  locationId!: string;
}

export class ListLocationsQueryDto {
  @ApiPropertyOptional({ example: LocationStatus.ACTIVE, enum: LocationStatus })
  @IsOptional()
  @IsEnum(LocationStatus, {
    message: `status must be one of: ${Object.values(LocationStatus).join(', ')}`,
  })
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
  @IsEnum(SyncRunStatus, {
    message: `status must be one of: ${Object.values(SyncRunStatus).join(', ')}`,
  })
  status?: SyncRunStatus;

  @ApiPropertyOptional({ example: SyncTrigger.BACKFILL, enum: SyncTrigger })
  @IsOptional()
  @IsEnum(SyncTrigger, {
    message: `trigger must be one of: ${Object.values(SyncTrigger).join(', ')}`,
  })
  trigger?: SyncTrigger;
}

export class SelectAccountDto {
  @ApiProperty({
    example: 'accounts/108327761122',
    description:
      'One of the `accountId`s from `GET /v1/connections/google/accounts/pending`. Anything else is refused.',
  })
  @IsString({ message: 'accountId must be a string' })
  @Length(1, 255, { message: 'accountId must be between 1 and 255 characters' })
  accountId!: string;
}
