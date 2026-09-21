"use client";

import { type ReactNode, useEffect, useState } from "react";


import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { PlatformAdminProfileService } from "@/app/_libs/services/platform-admin-profile.service";
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
 * desync from the actual signed-in principal. Reading the real `type` claim off the token itself
 * instead (`TokenService.getTokenType()`, via `useAuthToken`) removes that second,
 * independently-mutable signal entirely — there's only one source of truth now, and it's live by
 * construction.
 *
 * **Two sources, checked in order, because an admin session can live in either place.** A token in
 * localStorage answers both questions at once (signed in, and as what) and is the common case: every
 * password sign-in puts one there from the JSON response. A Google-accepted admin has none — they
 * arrive from a server-side redirect, which has no body for client JS to read — so their session
 * exists *only* as the httpOnly cookies `JwtStrategy` also accepts, and the only way to see it is to
 * make an authenticated request (`PlatformAdminProfileService.probeSession`). Tenants never need
 * this second step: their refresh cookie lets `useAuthToken` revive localStorage on its own, which
 * is exactly the thing a platform admin has no equivalent of.
 *
 * Two distinct failure cases, sent two different places: no token at all is `/login` (nothing to
 * be forbidden from); a real, valid, wrong-type token — a tenant-user token under an `admin`
 * session hint — is `/forbidden`, not `/login`, for the same reason `RequireAuth` doesn't send a
 * platform admin back to `/login` either: the visitor IS signed in, so `/login`'s own guard would
 * see their token and try to send them right back to the page that just rejected them.
 *
 * Note what that leaves this guard responsible for. `proxy.ts` gates `/admin` and `/admin/*` at
 * the edge — a tenant session hint is sent to `/forbidden` and a missing one to `/login` — so this
 * only ever mounts for a visitor whose hint already says `admin`. The cases it actually decides
 * are the ones the hint cannot: a *stale* hint (the token disagrees with it, hence the
 * `/forbidden` branch above) and an *empty localStorage* one, which is a live cookie-only session
 * the probe confirms. That is also why the probe returns a plain boolean: every caller that
 * reaches it is already past the tenant-vs-admin split, so telling a 401 from a 403 would change
 * nothing about where this sends them.
 *
 * `window.location.href`, not `router.replace()` — `RedirectIfAuthenticated`'s own comment
 * documents `router.replace()` called from an effect on first mount failing to actually swap the
 * URL/content in this app, leaving the visitor stuck rather than redirected. This guard used to be
 * the one place still using `router.replace()`, silently inheriting that same failure mode.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  // Deliberately NOT `reviveMissing: true`, which is what this used to pass.
  //
  // That option answers "nothing in localStorage" with a `/v1/auth/refresh` round trip — the
  // right move for a tenant, whose refresh cookie both proves the session and repairs
  // localStorage. For a platform admin it is actively harmful: they have no refresh token at all,
  // so the call cannot succeed, and `AuthController.refresh` *clears* `access_token` and the
  // session hint when it finds no refresh cookie. The probe below would then be asking about a
  // session the revive attempt had already destroyed.
  //
  // That is not hypothetical: an admin accepting their invite through Google arrives here from a
  // server-side redirect with real cookies and empty localStorage, and the old ordering signed
  // them straight back out — no password to retry with, and the Google button just repeated the
  // cycle. `false` keeps the check local (no request, no cookie clearing) and hands the
  // cookie-only case to `probeSession` instead.
  const { hasToken, tokenType } = useAuthToken();
  const [cookieAdmin, setCookieAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // Only when the local check came back empty-handed. A stored token has already answered both
    // questions (signed in, and as what), and re-asking the backend would just cost a request.
    if (hasToken !== false) return;

    let cancelled = false;
    void PlatformAdminProfileService.probeSession().then(isAdmin => {
      if (!cancelled) setCookieAdmin(isAdmin);
    });

    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  // Still waiting on the local check, or on the probe it handed off to.
  const isChecking = hasToken === null || (hasToken === false && cookieAdmin === null);
  const isAllowed = (hasToken === true && tokenType === "platform_admin") || cookieAdmin === true;
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
