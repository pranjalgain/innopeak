import { ApiProperty } from '@nestjs/swagger';

import { UserRole } from '../enums/user-role.enum';

export class AuthenticatedUserDto {
  @ApiProperty({ example: '0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  id!: string;

  @ApiProperty({ example: '0190f3aa-2a3e-7c1a-9b1e-8f2a1c3d4e5f' })
  tenantId!: string;

  @ApiProperty({ example: 'Jane Doe' })
  name!: string;

  @ApiProperty({ example: 'jane@thecoffeehouse.com' })
  email!: string;

  @ApiProperty({
    example: 'The Coffee House',
    description: 'The tenant/company name set at signup (`tenants.name`) — read-only in Settings.',
  })
  businessName!: string;

  @ApiProperty({ example: UserRole.OWNER, enum: UserRole })
  role!: UserRole;

  @ApiProperty({
    example: true,
    description:
      'Whether `users.password_hash` is set. `false` for a Google-only account that has never ' +
      'set a password — Settings uses this to show "Add password" instead of "Change password".',
  })
  hasPassword!: boolean;
}
