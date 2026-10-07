"use client";

import { type ReactNode, useEffect } from "react";

import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";

interface RequireAuthProps {
  children: ReactNode;
  /** Shown while the token check is in flight. Defaults to nothing — pass a shell-shaped skeleton for pages where a blank flash would look wrong (e.g. the dashboard). */
  loadingFallback?: ReactNode;
}

/**
 * Requires a real *tenant* session without bouncing authenticated users away (dashboard, `/onboarding/connect`); redirects to
 * `/login` with no token. A valid wrong-type token (a platform admin's) must not go there: `proxy.ts` sends hard navigations
 * to `/forbidden`, and this covers client-side navigation and tokens that changed type after mount (e.g. a second tab).
 * Sending it to `/login` would loop, since that page's guard sees the admin's token and sends them back.
 */
export function RequireAuth({ children, loadingFallback = null }: RequireAuthProps) {
  const { hasToken, tokenType } = useAuthToken();
  const isWrongType = hasToken === true && tokenType !== null && tokenType !== "tenant_user";

  useEffect(() => {
    if (hasToken === false) {
      // A hard redirect, not router.replace() — see RedirectIfAuthenticated's comment for why.
      window.location.href = ROUTES.LOGIN;
    } else if (isWrongType) {
      window.location.href = ROUTES.FORBIDDEN;
    }
  }, [hasToken, isWrongType]);

  if (hasToken === null) return <>{loadingFallback}</>;

  if (hasToken === false || isWrongType) return null;

  return <>{children}</>;
}
