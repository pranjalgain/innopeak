import { BusinessConnectionStatus } from '@common/enums/business-connection-status.enum';
import { BusinessStatus } from '@common/enums/business-status.enum';
import { toIsoString } from '@common/helpers/date.utils';
import type { AdminBusinessSummary } from '@db/repositories/admin-businesses/admin-businesses.db-service';
import { ApiProperty } from '@nestjs/swagger';

export class AdminBusinessResponseDto {
  @ApiProperty({ example: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: 'The Coastal Table' })
  name!: string;

  @ApiProperty({
    example: BusinessStatus.ACTIVE,
    enum: BusinessStatus,
    description: "Collapses the real tenant_status's pending_activation into active.",
  })
  status!: BusinessStatus;

  @ApiProperty({ example: BusinessConnectionStatus.CONNECTED, enum: BusinessConnectionStatus })
  connectionStatus!: BusinessConnectionStatus;

  @ApiProperty({ example: 'Maria Delgado' })
  ownerName!: string;

  @ApiProperty({ example: 'maria@coastaltable.com' })
  ownerEmail!: string;

  @ApiProperty({ example: 4 })
  userCount!: number;

  @ApiProperty({ example: '2025-11-02T09:00:00.000Z' })
  createdAt!: string;

  static from(summary: AdminBusinessSummary): AdminBusinessResponseDto {
    const dto = new AdminBusinessResponseDto();
    dto.id = summary.id;
    dto.name = summary.name;
    dto.status = summary.status;
    dto.connectionStatus = summary.connectionStatus;
    dto.ownerName = summary.ownerName;
    dto.ownerEmail = summary.ownerEmail;
    dto.userCount = summary.userCount;
    dto.createdAt = toIsoString(summary.createdAt);
    return dto;
  }
}
