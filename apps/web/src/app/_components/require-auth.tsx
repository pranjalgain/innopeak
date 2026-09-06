"use client";

import * as React from "react";

import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";

interface RequireAuthProps {
  children: React.ReactNode;
  /** Shown while the token check is in flight. Defaults to nothing — pass a shell-shaped skeleton for pages where a blank flash would look wrong (e.g. the dashboard). */
  loadingFallback?: React.ReactNode;
}

/**
 * Any screen that requires a real session but should NOT bounce an
 * already-authenticated user away — the dashboard (via `(dashboard)/layout.tsx`)
 * and `/onboarding/connect` both need this: without it, navigating straight
 * to either URL with no token at all still rendered the page (the
 * dashboard's `GoogleConnectionGuard` only checks the Business Profile
 * connection, never whether the caller is authenticated; `/onboarding/connect`
 * had no check at all). Redirects to `/login` when there's no token. The
 * opposite of `RedirectIfAuthenticated`, which bounces an authenticated user
 * AWAY from a page — this one requires authentication but lets an
 * authenticated user stay exactly where a signup/login flow sent them.
 */
export function RequireAuth({ children, loadingFallback = null }: RequireAuthProps) {
  const { hasToken } = useAuthToken();

  React.useEffect(() => {
    if (hasToken === false) {
      // A hard redirect, not router.replace() — see RedirectIfAuthenticated's comment for why.
      window.location.href = ROUTES.LOGIN;
    }
  }, [hasToken]);

  if (hasToken === null) return <>{loadingFallback}</>;

  if (hasToken === false) return null;

  return <>{children}</>;
}
