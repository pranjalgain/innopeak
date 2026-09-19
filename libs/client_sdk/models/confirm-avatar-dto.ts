// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ConfirmAvatarDto {
  /**
   * The provider\'s own id for the just-uploaded asset — Cloudinary\'s `public_id` from the direct-upload response, or the fixed sentinel id `NoopStorageProvider` returns when STORAGE_PROVIDER=noop. Never trusted at face value: the server independently verifies it against the provider before persisting anything.
   */
  providerAssetId: string;
}
