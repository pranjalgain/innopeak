import type { MediaOwner } from '@db/repositories/media/types/media.type';

import { AVATAR_FOLDER } from '../constants/media.constants';

/**
 * Always derived from the authenticated owner, never client input: `createUploadAuthorization`
 * signs it and `verifyUpload` re-derives it. That stops one owner claiming another's asset (a
 * `public_id` is visible in any avatar URL) and having their next upload delete it.
 *
 * `users`/`platform-admins` are distinct segments so the two id spaces can't be confused.
 */
export function avatarFolderFor(owner: MediaOwner): string {
  return owner.userId !== undefined
    ? `${AVATAR_FOLDER}/users/${owner.userId}`
    : `${AVATAR_FOLDER}/platform-admins/${owner.platformAdminId}`;
}
