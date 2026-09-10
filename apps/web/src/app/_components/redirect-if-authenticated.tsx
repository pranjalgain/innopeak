"use client";

import { type ReactNode, useEffect } from "react";

import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";

interface RedirectIfAuthenticatedProps {
  children: ReactNode;
}

/**
 * Wraps any page that has nothing to show once a real session already
 * exists — the marketing landing page, login, and signup all redirect
 * straight to the dashboard instead of rendering "sign up"/"get started"
 * to someone who's already signed in. The dashboard itself bounces on to
 * `/onboarding/connect` via `GoogleConnectionGuard` if this tenant hasn't
 * connected a Google Business Profile yet — deliberately NOT applied to
 * `/onboarding/connect` itself, which is exactly where an authenticated,
 * not-yet-connected user is supposed to land.
 *
 * Renders `children` immediately (including during the brief instant before
 * the token check resolves) rather than blanking out until it's certain —
 * the common case on the marketing landing page is an anonymous visitor,
 * and blocking first paint for every one of them just to catch the rare
 * already-logged-in visitor would be a bad trade. Only swaps to `null`
 * once `hasToken` is confirmed `true`, for the instant before the redirect
 * actually navigates away.
 */
export function RedirectIfAuthenticated({ children }: RedirectIfAuthenticatedProps) {
  const { hasToken } = useAuthToken();

  useEffect(() => {
    if (hasToken === true) {
      // A hard redirect, not router.replace() — calling router.replace() from an effect on a
      // page's first mount was observed to fetch the destination's RSC payload (200 OK) but
      // never actually swap the URL/content, leaving the user stuck on this page. window.location
      // side-steps that entirely, same technique AuthService.logout() already uses.
      window.location.href = ROUTES.DASHBOARD;
    }
  }, [hasToken]);

  if (hasToken === true) return null;

  return <>{children}</>;
}
