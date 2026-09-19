import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Deliberately just the avatar, not the caller's full profile — `MediaService` has no idea what a
 * `TenantOwnerProfile`/`PlatformAdminProfile` looks like, and shouldn't need to; that's exactly the
 * coupling that would have to grow with every new avatar owner. The caller already has the rest of
 * its own profile cached and only needs this one field refreshed.
 */
export class ConfirmAvatarResponseDto {
  @ApiPropertyOptional({
    example:
      'https://res.cloudinary.com/demo/image/upload/v1/avatars/users/0190f3b2/qjgc3adur7qa.png',
    type: String,
    nullable: true,
  })
  avatarUrl!: string | null;

  static from(avatarUrl: string | null): ConfirmAvatarResponseDto {
    const dto = new ConfirmAvatarResponseDto();
    dto.avatarUrl = avatarUrl;
    return dto;
  }
}
