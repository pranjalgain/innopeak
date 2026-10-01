import { useEffect } from "react";

import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";

interface UseAdminGuardResult {
  /** Still waiting on the session check. */
  isChecking: boolean;
  isAllowed: boolean;
}

/**
 * The decision `AdminGuard` renders off — every screen under `/admin` requires a live session AND
 * a platform-admin token, mirroring how the backend keeps `platform_admins` as a separate identity
 * from tenant `users`.
 *
 * `useAuthToken` answers this directly now, for every path a session can be established through —
 * password sign-in, Google invite accept, an ordinary reload — because it reads the `session`
 * cookie the backend sets in all of them, rather than a JWT that only ever ended up in
 * `localStorage` for the password path. There is no second, network-probing branch left for the
 * cookie-only cases (a Google-accepted admin, previously) to fall into: the cookie already answers
 * for them too.
 *
 * Two distinct failure cases, sent two different places: no session at all is `/login` (nothing to
 * be forbidden from); a real, valid, wrong-type session — a tenant-user session under an `admin`
 * route — is `/forbidden`, not `/login`, for the same reason `RequireAuth` doesn't send a platform
 * admin back to `/login` either: the visitor IS signed in, so `/login`'s own guard would see their
 * session and try to send them right back to the page that just rejected them.
 *
 * `window.location.href`, not `router.replace()` — `RedirectIfAuthenticated`'s own comment
 * documents `router.replace()` called from an effect on first mount failing to actually swap the
 * URL/content in this app, leaving the visitor stuck rather than redirected.
 */
export function useAdminGuard(): UseAdminGuardResult {
  const { hasToken, tokenType } = useAuthToken();

  const isChecking = hasToken === null;
  const isAllowed = hasToken === true && tokenType === "platform_admin";
  const isSignedIn = hasToken === true;

  useEffect(() => {
    if (isChecking || isAllowed) return;
    window.location.href = isSignedIn ? ROUTES.FORBIDDEN : ROUTES.LOGIN;
  }, [isChecking, isAllowed, isSignedIn]);

  return { isChecking, isAllowed };
}
