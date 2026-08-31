import { ApiProperty } from '@nestjs/swagger';

import { UserProfile } from '../interfaces/user.interface';

export class UserResponseDto {
  @ApiProperty({ description: 'User ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ description: 'User email address', example: 'user@example.com' })
  email!: string;

  @ApiProperty({ description: 'User first name', example: 'John', nullable: true })
  firstName!: string | null;

  @ApiProperty({ description: 'User last name', example: 'Doe', nullable: true })
  lastName!: string | null;

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

  static fromUserProfile(profile: UserProfile): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = profile.id;
    dto.email = profile.email;
    dto.firstName = profile.firstName;
    dto.lastName = profile.lastName;
    dto.phone = profile.phone;
    dto.isActive = profile.isActive;
    dto.isEmailVerified = profile.isEmailVerified;
    dto.mfaEnabled = profile.mfaEnabled;
    dto.roles = profile.roles;
    dto.createdAt = profile.createdAt;
    return dto;
  }
}
