import { ApiProperty } from '@nestjs/swagger';

import { UserProfile } from '../interfaces/user.interface';

export class UserResponseV2Dto {
  @ApiProperty({ description: 'User ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  email!: string;

  @ApiProperty({ description: 'Full name (computed)', example: 'John Doe' })
  fullName!: string;

  @ApiProperty({ description: 'User phone number', example: '+1234567890', nullable: true })
  phone!: string | null;

  @ApiProperty({ description: 'Whether the user account is active', example: true })
  isActive!: boolean;

  @ApiProperty({ description: 'Whether the user email is verified', example: false })
  isEmailVerified!: boolean;

  @ApiProperty({ description: 'Whether MFA is enabled', example: false })
  mfaEnabled!: boolean;

  @ApiProperty({ description: 'User roles', example: ['user'], type: [String] })
  roles!: string[];

  @ApiProperty({ description: 'Account creation date' })
  createdAt!: Date;

  static fromUserProfile(profile: UserProfile): UserResponseV2Dto {
    const dto = new UserResponseV2Dto();
    dto.id = profile.id;
    dto.email = profile.email;
    dto.fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || '';
    dto.phone = profile.phone;
    dto.isActive = profile.isActive;
    dto.isEmailVerified = profile.isEmailVerified;
    dto.mfaEnabled = profile.mfaEnabled;
    dto.roles = profile.roles;
    dto.createdAt = profile.createdAt;
    return dto;
  }
}
