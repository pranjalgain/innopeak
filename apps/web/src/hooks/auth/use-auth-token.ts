import * as React from "react";

import { ApiClient } from "@/app/_libs/services/api-client";
import { TokenService } from "@/app/_libs/services/token.service";

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
 * Three states, and the middle one is the whole point: a *valid* token resolves true immediately;
 * *no* token resolves false immediately; an **expired** token is neither — the 15-minute access
 * token lapses long before the 7-day refresh cookie does, so the honest answer is "ask the
 * backend". Treating expired-but-present as signed in (the old `Boolean(getAccessToken())` check)
 * is what let a stale localStorage entry disagree with the edge middleware and bounce the user
 * between /login and /dashboard forever; treating it as signed out would instead sign people out
 * every 15 idle minutes despite a perfectly good refresh token.
 */
export function useAuthToken(): UseAuthTokenResult {
  const [hasToken, setHasToken] = React.useState<boolean | null>(null);

  useIsomorphicLayoutEffect(() => {
    let cancelled = false;

    if (TokenService.getAccessToken()) {
      setHasToken(true);
      return;
    }

    if (!TokenService.getStoredAccessToken()) {
      setHasToken(false);
      return;
    }

    // Present but expired — try to revive it before deciding. ApiClient.refreshSession is
    // single-flight, so several guards mounting at once still make one rotation, and the stale
    // token is cleared on failure so the next mount short-circuits to false instead of retrying.
    void ApiClient.refreshSession().then((refreshed) => {
      if (cancelled) return;
      if (!refreshed) TokenService.clear();
      setHasToken(refreshed);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return { hasToken };
}
