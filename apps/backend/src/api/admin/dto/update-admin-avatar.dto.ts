import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, Length } from 'class-validator';

export class UpdateAdminAvatarDto {
  @ApiProperty({
    example: 'https://cdn.innopeak.com/avatars/admin-1.png',
    description:
      'A URL to an already-hosted image — this endpoint stores the URL, it does not accept or ' +
      'host a file upload itself.',
  })
  @IsString({ message: 'avatarUrl must be a string' })
  @Length(1, 2048, { message: 'avatarUrl must be between 1 and 2048 characters' })
  @IsUrl({}, { message: 'avatarUrl must be a valid URL' })
  avatarUrl!: string;
}
