import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ConfirmAvatarDto {
  @ApiProperty({
    example: 'avatars/users/0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f/qjgc3adur7qa2cvosk43',
    description:
      "The provider's own id for the just-uploaded asset — Cloudinary's `public_id` from the " +
      'direct-upload response, or the sentinel id `NoopStorageProvider` handed back with the ' +
      'authorization when STORAGE_PROVIDER=noop. Never trusted at face value: the server ' +
      "independently verifies it against the provider, and against the caller's own folder, " +
      'before persisting anything.',
  })
  @IsString({ message: 'providerAssetId must be a string' })
  @Length(1, 255, { message: 'providerAssetId must be between 1 and 255 characters' })
  providerAssetId!: string;
}
