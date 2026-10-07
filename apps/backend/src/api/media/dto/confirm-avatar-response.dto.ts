import { ApiPropertyOptional } from '@nestjs/swagger';

/** Deliberately just the avatar: `MediaService` must not know owner profile shapes, which would grow with every new avatar owner. */
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
