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
 * Any screen that requires a real *tenant* session but should NOT bounce an
 * already-authenticated user away — the dashboard (via `(dashboard)/layout.tsx`)
 * and `/onboarding/connect` both need this: without it, navigating straight
 * to either URL with no token at all still rendered the page (the
 * dashboard's `GoogleConnectionGuard` only checks the Business Profile
 * connection, never whether the caller is authenticated; `/onboarding/connect`
 * had no check at all). Redirects to `/login` when there's no token. The
 * opposite of `RedirectIfAuthenticated`, which bounces an authenticated user
 * AWAY from a page — this one requires authentication but lets an
 * authenticated user stay exactly where a signup/login flow sent them.
 *
 * A *valid but wrong-type* token — a platform admin's — is not the same case as no token at all,
 * and must not be routed the same way. `proxy.ts` already redirects this case to `/forbidden` at
 * the edge for a hard navigation; this check exists for the paths that don't go through it — a
 * client-side `router.push`/`Link` navigation into a guarded route, or a token that only became
 * the wrong type after this component already mounted (e.g. a second tab logged in as someone
 * else). Redirecting a wrong-type token to `/login` here would be actively wrong: the admin IS
 * signed in, so `/login`'s own guard would see their token and try to send them straight back to
 * a tenant page it also has to reject — the exact infinite loop `proxy.ts`'s session-hint value
 * exists to prevent, just re-created one layer up if this component doesn't agree with it.
 */
export function RequireAuth({ children, loadingFallback = null }: RequireAuthProps) {
  // `reviveMissing`: a Google sign-in lands here with real cookies but empty localStorage.
  const { hasToken, tokenType } = useAuthToken({ reviveMissing: true });
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
