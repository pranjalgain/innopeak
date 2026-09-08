import * as React from "react";

import { ApiClient } from "@/app/_libs/services/api-client";
import { TokenService } from "@/app/_libs/services/token.service";

interface UseAuthTokenOptions {
  /**
   * Whether "nothing in localStorage" is worth a `refresh` round trip to disprove.
   *
   * `true` for `RequireAuth`: a Google sign-in comes back through a server-side redirect straight
   * to a guarded route with no JSON body for any client JS to read, so localStorage is empty even
   * though real session cookies exist — short-circuiting to false there hard-redirected to /login,
   * the edge middleware's session hint bounced it straight back, and the tab flashed between the
   * two forever.
   *
   * `false` for `RedirectIfAuthenticated`, which also wraps the public marketing page: an
   * anonymous visitor has nothing stored *because they are anonymous*, and asking anyway spent a
   * request per landing-page view against a 20/min per-IP throttle shared with real users' token
   * refreshes — enough NAT'd anonymous traffic could exhaust it and sign genuine sessions out.
   */
  reviveMissing?: boolean;
}

interface UseAuthTokenResult {
  /** `null` while the initial check is in flight — localStorage isn't available during SSR, so this is deferred to an effect to avoid a hydration mismatch. */
  hasToken: boolean | null;
}

// A layout effect (not a plain effect) so the synchronous part of the check resolves before the
// browser paints — an authenticated visitor landing on a page guarded by RedirectIfAuthenticated
// would otherwise see that page's content flash for one frame before the redirect kicks in.
// Guarded for SSR, where useLayoutEffect would otherwise warn (it never runs there; the check only
// makes sense client-side).
const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Answers "does this visitor have a usable session?" for the route guards.
 *
 * Two states resolve immediately, and everything else asks the backend. A *valid* localStorage
 * token resolves true immediately. Everything else — expired, or missing entirely — falls through
 * to `ApiClient.refreshSession()`, which reads the httpOnly `refresh_token` cookie the backend set
 * directly and is the only reliable source of truth localStorage can disagree with.
 *
 * Missing-entirely used to resolve false immediately, on the assumption that "nothing in
 * localStorage" meant "never signed in" — true as long as every sign-in path was a `fetch()` whose
 * JSON body this hook could read into localStorage. Google OAuth breaks that: the browser leaves
 * the app for Google and comes back through a server-side redirect straight to `/dashboard`, with
 * no JSON response for any client JS to read, so localStorage is never written even though the
 * backend already set real session cookies. Short-circuiting to false there meant `RequireAuth`
 * hard-redirected to `/login`, the edge middleware's session-hint cookie immediately bounced that
 * back to `/dashboard`, localStorage was still empty, and the tab flashed between the two forever.
 * Falling through to a refresh attempt costs one cheap 401 for a genuinely signed-out visitor, and
 * silently repairs localStorage for one who is not.
 *
 * Treating expired-but-present as signed in (the old `Boolean(getAccessToken())` check) is what
 * let a stale localStorage entry disagree with the edge middleware and bounce the user between
 * /login and /dashboard forever for a different reason — idle past the 15-minute access TTL;
 * treating it as signed out would instead sign people out every 15 idle minutes despite a
 * perfectly good refresh token.
 */
export function useAuthToken({ reviveMissing = false }: UseAuthTokenOptions = {}): UseAuthTokenResult {
  const [hasToken, setHasToken] = React.useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    let cancelled = false;

    if (TokenService.getAccessToken()) {
      setHasToken(true);
      return;
    }

    // Nothing stored at all, on a screen where a session was never likely (see `reviveMissing`):
    // answer immediately rather than spending a request to confirm what is almost always "no".
    if (!TokenService.getStoredAccessToken() && !reviveMissing) {
      setHasToken(false);
      return;
    }

    // Expired, or missing on a screen that must know for certain. ApiClient.refreshSession is
    // single-flight, so several guards mounting at once still make one rotation, and the stale
    // token (if any) is cleared on failure so the next mount short-circuits to false instead of
    // retrying.
    void ApiClient.refreshSession().then((refreshed) => {
      if (cancelled) return;
      if (!refreshed) TokenService.clear();
      setHasToken(refreshed);
    });

    return () => {
      cancelled = true;
    };
  }, [reviveMissing]);

  return { hasToken };
}
