// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface AvatarUploadAuthorizationResponseDto {
  provider: AvatarUploadAuthorizationResponseDtoProviderEnum;
  /**
   * POST the file here as multipart/form-data, as `file`, alongside every `formFields` entry. Empty when `provider` is `noop`: there is nothing to upload to, so skip straight to confirm using `providerAssetId`.
   */
  uploadUrl: string;
  /**
   * Send verbatim — the signature covers these, so dropping or editing any one of them makes the provider reject the upload. Treat as opaque; do not depend on individual key names.
   */
  formFields: object;
  /**
   * Present only when `provider` is `noop` — the id to confirm with.
   */
  providerAssetId?: string;
}

export const AvatarUploadAuthorizationResponseDtoProviderEnum = {
  Cloudinary: 'cloudinary',
  Noop: 'noop',
} as const;

export type AvatarUploadAuthorizationResponseDtoProviderEnum =
  (typeof AvatarUploadAuthorizationResponseDtoProviderEnum)[keyof typeof AvatarUploadAuthorizationResponseDtoProviderEnum];
