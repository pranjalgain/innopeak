// @ts-nocheck
/* tslint:disable */
/* eslint-disable */

export interface ConfirmAvatarDto {
  /**
   * The provider\'s own id for the just-uploaded asset — Cloudinary\'s `public_id` from the direct-upload response, or the sentinel id `NoopStorageProvider` handed back with the authorization when STORAGE_PROVIDER=noop. Never trusted at face value: the server independently verifies it against the provider, and against the caller\'s own folder, before persisting anything.
   */
  providerAssetId: string;
}
