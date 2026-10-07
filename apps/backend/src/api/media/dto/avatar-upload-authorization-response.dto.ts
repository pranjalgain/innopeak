import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { UploadAuthorization } from '../types/storage-provider.type';

/** Shared by the tenant and admin profile screens; only the confirm step's owner differs. */
export class AvatarUploadAuthorizationResponseDto {
  @ApiProperty({ example: 'cloudinary', enum: ['cloudinary', 'noop'] })
  provider!: UploadAuthorization['provider'];

  @ApiProperty({
    example: 'https://api.cloudinary.com/v1_1/innopeak-demo/image/upload',
    description:
      'POST the file here as multipart/form-data, as `file`, alongside every `formFields` entry. ' +
      'Empty when `provider` is `noop`: there is nothing to upload to, so skip straight to ' +
      'confirm using `providerAssetId`.',
  })
  uploadUrl!: string;

  @ApiProperty({
    example: {
      api_key: '123456789012345',
      signature: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      timestamp: '1735689600',
      folder: 'avatars/users/0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
      allowed_formats: 'jpg,jpeg,png,webp,gif,avif,heic,heif,bmp',
      max_file_size: '10485760',
    },
    description:
      'Send verbatim — the signature covers these, so dropping or editing any one of them makes ' +
      'the provider reject the upload. Treat as opaque; do not depend on individual key names.',
  })
  formFields!: Record<string, string>;

  @ApiPropertyOptional({
    example: 'noop-0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
    description: 'Present only when `provider` is `noop` — the id to confirm with.',
  })
  providerAssetId?: string;

  static from(authorization: UploadAuthorization): AvatarUploadAuthorizationResponseDto {
    const dto = new AvatarUploadAuthorizationResponseDto();
    dto.provider = authorization.provider;
    dto.uploadUrl = authorization.uploadUrl;
    dto.formFields = authorization.formFields;
    if (authorization.providerAssetId !== undefined) {
      dto.providerAssetId = authorization.providerAssetId;
    }
    return dto;
  }
}
