import type { MediaOwner } from '@db/repositories/media/types/media.type';

import { AVATAR_FOLDER } from '../constants/media.constants';

/**
 * The provider-side folder an owner's avatars live in — and the one thing tying a confirmed asset
 * back to the caller that uploaded it.
 *
 * Both halves of the flow derive the folder from the *authenticated* owner, never from anything the
 * client sends: `createUploadAuthorization` signs it (so the upload physically cannot land anywhere
 * else — changing the `folder` form field invalidates Cloudinary's signature), and `verifyUpload`
 * re-derives it to check the confirmed asset actually sits there.
 *
 * That pairing is what stops one owner claiming another's asset. A `public_id` is readable by
 * anyone who can see a rendered avatar URL, so without it, confirming someone else's id was enough
 * to point your own `media` row at their asset — and your next upload would then delete it out from
 * under them.
 *
 * `users`/`platform-admins` are kept as distinct segments rather than bare ids so the two id spaces
 * can never be confused for one another, in the folder tree or in a reviewer's head.
 */
export function avatarFolderFor(owner: MediaOwner): string {
  return owner.userId !== undefined
    ? `${AVATAR_FOLDER}/users/${owner.userId}`
    : `${AVATAR_FOLDER}/platform-admins/${owner.platformAdminId}`;
}
