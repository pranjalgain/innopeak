import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AvatarUploadAuthorizationResponseDto } from '../dto/avatar-upload-authorization-response.dto';
import { ConfirmAvatarResponseDto } from '../dto/confirm-avatar-response.dto';
import { ConfirmAvatarDto } from '../dto/confirm-avatar.dto';

export function ApiGetAdminAvatarUploadAuthorization(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Get a signed avatar upload authorization',
      description:
        'Mints a short-lived, provider-signed authorization the client uploads the new avatar ' +
        'image directly with — the backend never sees the file itself. Call this first, upload ' +
        'to the provider, then confirm what actually landed via the confirm route below.',
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: AvatarUploadAuthorizationResponseDto,
      examples: {
        default: {
          summary: 'Cloudinary authorization',
          value: {
            provider: 'cloudinary',
            uploadUrl: 'https://api.cloudinary.com/v1_1/innopeak-demo/image/upload',
            formFields: {
              api_key: '123456789012345',
              signature: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
              timestamp: '1735689600',
              folder: 'avatars/platform-admins/0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f',
              allowed_formats: 'jpg,jpeg,png,webp,gif,avif,heic,heif,bmp',
              max_file_size: '10485760',
            },
          },
        },
      },
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}

export function ApiConfirmAdminAvatar(): ReturnType<typeof applyDecorators> {
  return applyDecorators(
    ApiBearerAuth(),
    ApiOperation({
      summary: 'Confirm an uploaded avatar',
      description:
        'Independently verifies the uploaded asset against the provider (never trusting the ' +
        "client's own claim) and, once verified, stores it as this admin's current avatar — " +
        'replacing any previous one.',
    }),
    ApiBody({
      type: ConfirmAvatarDto,
      examples: {
        default: {
          summary: 'Typical request',
          value: {
            providerAssetId:
              'avatars/platform-admins/0190f3b2-2a3e-7c1a-9b1e-8f2a1c3d4e5f/qjgc3adur7qa2cvosk43',
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.OK,
      type: ConfirmAvatarResponseDto,
      examples: {
        default: {
          summary: 'Avatar updated',
          value: {
            avatarUrl:
              'https://res.cloudinary.com/innopeak-demo/image/upload/v1/avatars/platform-admins/0190f3b2/av.png',
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'Validation failed, or the uploaded asset could not be verified',
    }),
    ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Missing or invalid token' }),
    ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a platform admin' })
  );
}
