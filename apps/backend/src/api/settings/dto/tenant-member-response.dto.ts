import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { toIsoString } from '@common/helpers/date.utils';
import { ApiProperty } from '@nestjs/swagger';

export interface TenantMemberRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  invitedAt: string;
}

export class TenantMemberResponseDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({
    example: 'sam.rivera@thecoffeehouse.com',
    description:
      "Before the invite is accepted, this is the invited email address — the invitee's own " +
      "name isn't known yet, since they choose it on the accept screen, not the owner on the " +
      'invite form.',
  })
  name!: string;

  @ApiProperty({ example: 'sam.rivera@thecoffeehouse.com' })
  email!: string;

  @ApiProperty({ example: UserRole.MEMBER, enum: UserRole })
  role!: UserRole;

  @ApiProperty({ example: UserStatus.INVITED, enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({
    example: '2026-03-01T09:12:00.000Z',
    description: "The owner's own row (created at signup, never invited) uses its own `createdAt`.",
  })
  invitedAt!: string;

  static from(row: TenantMemberRow): TenantMemberResponseDto {
    const dto = new TenantMemberResponseDto();
    dto.id = row.id;
    dto.name = row.name;
    dto.email = row.email;
    dto.role = row.role;
    dto.status = row.status;
    dto.invitedAt = toIsoString(row.invitedAt);
    return dto;
  }
}
