"use client";

import { type ReactNode, useEffect } from "react";


import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Every screen under `/admin` requires a live session AND a platform-admin token — a tenant owner
 * has no access here, mirroring how the backend keeps `platform_admins` as a separate identity
 * from tenant `users`.
 *
 * Used to check a `SessionService` role string in localStorage, set once at login (both that
 * service and the `useSession` hook over it are gone now — this was their only reader) — on its own
 * that is neither an authentication check (anything can write it) nor a *live* one, and it could
 * desync from the actual signed-in principal: `useAuthToken`'s revive-on-refresh path
 * (`reviveMissing: true`, needed because a platform admin's access token lasts 15 minutes with no
 * refresh token to renew it — see `TokenService.signPlatformAdminAccessToken` on the backend —
 * so an expired admin used to sit inside a fully-rendered shell where every request 401'd) never
 * touched that flag, so a revived admin session could pass the token check while the stale role
 * string still said "tenant". Reading the real `type` claim off the token itself instead
 * (`TokenService.getTokenType()`, via `useAuthToken`) removes that second, independently-mutable
 * signal entirely — there's only one source of truth now, and it's live by construction.
 *
 * Two distinct failure cases, sent two different places: no token at all is `/login` (nothing to
 * be forbidden from); a real, valid, wrong-type token — a signed-in tenant user manually visiting
 * `/admin` — is `/forbidden`, not `/login`, for the same reason `RequireAuth` doesn't send a
 * platform admin back to `/login` either: the visitor IS signed in, so `/login`'s own guard would
 * see their token and try to send them right back to the page that just rejected them.
 *
 * `window.location.href`, not `router.replace()` — `RedirectIfAuthenticated`'s own comment
 * documents `router.replace()` called from an effect on first mount failing to actually swap the
 * URL/content in this app, leaving the visitor stuck rather than redirected. This guard used to be
 * the one place still using `router.replace()`, silently inheriting that same failure mode.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  // `reviveMissing`: an admin arriving on a fresh tab has real session cookies but empty
  // localStorage, and must not be bounced before the refresh attempt has had its say.
  const { hasToken, tokenType } = useAuthToken({ reviveMissing: true });

  const isChecking = hasToken === null;
  const isAllowed = hasToken === true && tokenType === "platform_admin";
  // A real session, just not one that's provably allowed here — distinct from "no session at all"
  // below. Deliberately "not provably an admin" rather than "provably not an admin": a token whose
  // `type` claim can't be read is not evidence of admin access either, and routing it to `/login`
  // would loop. `/login` is in `proxy.ts`'s matcher, so an admin session hint still sitting in the
  // browser bounces it straight back to `/admin`, back to here, and around again until that cookie
  // expires — nothing in that cycle calls the API, so nothing ever clears the cookie. `/forbidden`
  // is terminal: it's deliberately not in that matcher, so it always renders and the loop can't
  // start. `/admin` fails closed this way on purpose, unlike `RequireAuth`'s tenant surface, which
  // stays permissive for an unreadable type and leans on the backend's own 403.
  const isSignedIn = hasToken === true;

  useEffect(() => {
    if (isChecking || isAllowed) return;
    window.location.href = isSignedIn ? ROUTES.FORBIDDEN : ROUTES.LOGIN;
  }, [isChecking, isAllowed, isSignedIn]);

  if (isChecking) return <ShellSkeleton />;

  if (!isAllowed) return null;

  return <>{children}</>;
}
