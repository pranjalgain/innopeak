import { useEffect, useLayoutEffect, useState } from "react";

import { TokenService, type TokenType } from "@/app/_libs/services/token.service";

interface UseAuthTokenResult {
  /** `null` while the initial check is in flight — the cookie isn't readable during SSR, so this is deferred to an effect to avoid a hydration mismatch. */
  hasToken: boolean | null;
  /**
   * Which principal `hasToken`'s session belongs to — `null` while `hasToken` is still `null` or
   * `false`. Routing-only, same caveat as `TokenService.getTokenType()` itself: not a security
   * boundary, just which page a guard shows — the backend enforces the real check on every request
   * regardless of what this says.
   */
  tokenType: TokenType | null;
}

// A layout effect (not a plain effect) so the check resolves before the browser paints — an
// authenticated visitor landing on a page guarded by RedirectIfAuthenticated would otherwise see
// that page's content flash for one frame before the redirect kicks in. Guarded for SSR, where
// useLayoutEffect would otherwise warn (it never runs there; the check only makes sense client-side).
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Answers "does this visitor have a usable session, and as what?" for the route guards — a
 * synchronous read of the non-credential `session` cookie the backend already sets on every
 * sign-in (see `TokenService.getTokenType`'s own doc comment), never a network call.
 *
 * That cookie already lives exactly as long as the session it describes — the refresh token's
 * lifetime for a tenant, the access token's own for a platform admin (who has no refresh token to
 * revive with) — so there is nothing here to "revive": a Google sign-in landing straight on a
 * guarded route via a server-side redirect already has the cookie set by the time this runs, the
 * same as a password sign-in does. That's what used to make this genuinely hard: reading a JWT out
 * of `localStorage` could disagree with the cookies the backend and edge middleware both already
 * agreed on, which is what produced the redirect loops the comments elsewhere in this codebase
 * document. Reading the same cookie everything else already reads removes the disagreement instead
 * of working around it.
 */
export function useAuthToken(): UseAuthTokenResult {
  const [state, setState] = useState<UseAuthTokenResult>({ hasToken: null, tokenType: null });

  useIsomorphicLayoutEffect(() => {
    const tokenType = TokenService.getTokenType();
    setState({ hasToken: tokenType !== null, tokenType });
  }, []);

  return state;
}
