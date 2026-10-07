import { useEffect } from "react";

import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";

interface UseAdminGuardResult {
  /** Still waiting on the session check. */
  isChecking: boolean;
  isAllowed: boolean;
}

/**
 * Every `/admin` screen requires a live session AND a platform-admin token. No session goes to
 * `/admin-login` (where the edge sends anonymous visitors, so Back after sign-out lands sensibly);
 * a valid tenant-user session goes to `/forbidden`, not `/login`, whose own guard would bounce the
 * signed-in visitor straight back.
 *
 * `window.location.href`, not `router.replace()`: called from an effect on first mount it fails to
 * swap the URL/content in this app (see `RedirectIfAuthenticated`).
 */
export function useAdminGuard(): UseAdminGuardResult {
  const { hasToken, tokenType } = useAuthToken();

  const isChecking = hasToken === null;
  const isAllowed = hasToken === true && tokenType === "platform_admin";
  const isSignedIn = hasToken === true;

  useEffect(() => {
    if (isChecking || isAllowed) return;
    window.location.href = isSignedIn ? ROUTES.FORBIDDEN : ROUTES.ADMIN_LOGIN;
  }, [isChecking, isAllowed, isSignedIn]);

  return { isChecking, isAllowed };
}
