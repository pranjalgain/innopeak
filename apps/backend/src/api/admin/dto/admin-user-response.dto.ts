import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { toIsoStringOrNull } from '@common/helpers/date.utils';
import type { AdminUserRow } from '@db/repositories/admin-users/types/admin-users.type';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminUserResponseDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  businessId!: string;

  @ApiProperty({ example: 'The Coffee House' })
  businessName!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  email!: string;

  @ApiProperty({ example: UserRole.OWNER, enum: UserRole })
  role!: UserRole;

  @ApiProperty({
    example: true,
    description: "Derived from `users.status`: true only when it's exactly `active`.",
  })
  isActive!: boolean;

  @ApiPropertyOptional({
    example: '2026-03-01T09:12:00.000Z',
    type: String,
    nullable: true,
    description:
      'Most recent refresh-token issuance for this user — there is no dedicated ' +
      '`last_login_at` column. `null` means no session has ever been issued.',
  })
  lastLoginAt!: string | null;

  static from(row: AdminUserRow): AdminUserResponseDto {
    const dto = new AdminUserResponseDto();
    dto.id = row.id;
    dto.businessId = row.businessId;
    dto.businessName = row.businessName;
    dto.name = row.name;
    dto.email = row.email;
    dto.role = row.role;
    dto.isActive = row.status === UserStatus.ACTIVE;
    dto.lastLoginAt = toIsoStringOrNull(row.lastLoginAt);
    return dto;
  }
}
