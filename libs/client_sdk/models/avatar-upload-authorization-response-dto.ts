// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AvatarUploadAuthorizationResponseDto {
  provider: AvatarUploadAuthorizationResponseDtoProviderEnum;
  /**
   * POST the file here as multipart/form-data, as `file`, alongside every `formFields` entry.
   */
  uploadUrl: string;
  /**
   * Send verbatim — the signature covers these, so dropping or editing any one of them makes the provider reject the upload. Treat as opaque; do not depend on individual key names.
   */
  formFields: object;
}

export const AvatarUploadAuthorizationResponseDtoProviderEnum = {
  Cloudinary: 'cloudinary',
} as const;

export type AvatarUploadAuthorizationResponseDtoProviderEnum =
  (typeof AvatarUploadAuthorizationResponseDtoProviderEnum)[keyof typeof AvatarUploadAuthorizationResponseDtoProviderEnum];
