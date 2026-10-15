import { PaginationMetaDto } from '@common/dto/pagination-meta.dto';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import { toIsoString } from '@common/helpers/date.utils';
import type {
  PlatformActivityDetails,
  PlatformActivityRow,
} from '@db/repositories/admin-overview/types/admin-overview.type';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlatformSettingChangeDto {
  @ApiProperty({
    example: 'googleLoginEnabled',
    description: 'The platform setting that changed, as its API field name.',
  })
  field!: string;

  @ApiProperty({ example: true })
  from!: boolean;

  @ApiProperty({ example: false })
  to!: boolean;
}

export class PlatformActivityDetailsDto {
  @ApiProperty({ type: [PlatformSettingChangeDto] })
  changes!: PlatformSettingChangeDto[];

  @ApiPropertyOptional({
    example: true,
    description:
      'Present when the admin confirmed switching a provider off although users could then only sign in with it.',
  })
  lockoutConfirmed?: boolean;
}

export class PlatformActivityResponseDto {
  @ApiProperty({ example: '0190f3b4-1a88-70c5-8d19-6b2e4f7a9c33' })
  id!: string;

  @ApiProperty({
    example: PlatformActivityType.BUSINESS_SUSPENDED,
    enum: PlatformActivityType,
  })
  type!: PlatformActivityType;

  @ApiProperty({
    example: 'admin@innopeak.com',
    description:
      'Who did it: the platform admin; the business owner\'s email for business_joined; the label "owner (self-service)" for an owner\'s own erasure request or cancellation; or the system actor for the nightly erasure.',
  })
  actorEmail!: string;

  @ApiPropertyOptional({
    example: 'Oak & Iron Hardware',
    type: String,
    nullable: true,
    description: 'Set for the business_* entries (including business_joined) and user_* entries.',
  })
  businessName!: string | null;

  @ApiPropertyOptional({
    example: 'priya.ops@innopeak.com',
    type: String,
    nullable: true,
    description: 'Set for admin_invite_sent/admin_invite_revoked entries only.',
  })
  email!: string | null;

  @ApiPropertyOptional({
    type: PlatformActivityDetailsDto,
    nullable: true,
    description: 'What a platform_settings_changed entry changed; null for every other type.',
  })
  details!: PlatformActivityDetailsDto | null;

  @ApiProperty({ example: '2026-09-11T09:12:00.000Z' })
  occurredAt!: string;

  static from(row: PlatformActivityRow): PlatformActivityResponseDto {
    const dto = new PlatformActivityResponseDto();
    dto.id = row.id;
    dto.type = row.type;
    dto.actorEmail = row.actorEmail;
    dto.businessName = row.businessName;
    dto.email = row.targetEmail;
    dto.details =
      row.details === null ? null : PlatformActivityResponseDto.detailsFrom(row.details);
    dto.occurredAt = toIsoString(row.occurredAt);
    return dto;
  }

  private static detailsFrom(details: PlatformActivityDetails): PlatformActivityDetailsDto {
    const dto = new PlatformActivityDetailsDto();
    dto.changes = details.changes.map(change => ({
      field: change.field,
      from: change.from,
      to: change.to,
    }));
    if (details.lockoutConfirmed === true) {
      dto.lockoutConfirmed = true;
    }
    return dto;
  }
}

export class PlatformActivityListResponseDto {
  @ApiProperty({ type: [PlatformActivityResponseDto], description: 'Newest first.' })
  activities!: PlatformActivityResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}
