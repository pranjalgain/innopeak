/** Root of the provider-side folder tree every avatar lands in. Never used on its own: each owner
 *  gets their own subfolder under it, which is what binds a confirmed asset to the caller that
 *  uploaded it — see `avatarFolderFor` for why that binding is load-bearing rather than cosmetic. */
export const AVATAR_FOLDER = 'avatars';
