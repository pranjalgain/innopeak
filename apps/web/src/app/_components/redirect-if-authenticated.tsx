"use client";

import { type ReactNode, useEffect } from "react";

import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";

interface RedirectIfAuthenticatedProps {
  children: ReactNode;
}

/**
 * Wraps pages with nothing to show a signed-in user (landing, login, signup) and redirects to the dashboard. Deliberately not
 * applied to `/onboarding/connect`, where an authenticated, not-yet-connected user is meant to land.
 * Renders `children` immediately rather than blanking until the token check resolves: most visitors are anonymous and
 * shouldn't pay first paint for the rare logged-in one. Swaps to `null` only once `hasToken` is true.
 */
export function RedirectIfAuthenticated({ children }: RedirectIfAuthenticatedProps) {
  const { hasToken, tokenType } = useAuthToken();

  useEffect(() => {
    if (hasToken === true) {
      // Sent to this principal's own home, not a fixed `/dashboard`: an admin redirected there fails RequireAuth's type check
      // and bounces back to this page, the infinite loop this pairing with `RequireAuth`/`proxy.ts` prevents.
      // `tokenType === null` (a decode hiccup) falls back to the tenant destination.
      //
      // A hard redirect, not router.replace(): from an effect on first mount it was observed to fetch the destination's RSC
      // payload but never swap the URL, leaving the user stuck. Same technique as AuthService.logout().
      window.location.href = tokenType === "platform_admin" ? ROUTES.ADMIN : ROUTES.DASHBOARD;
    }
  }, [hasToken, tokenType]);

  if (hasToken === true) return null;

  return <>{children}</>;
}
