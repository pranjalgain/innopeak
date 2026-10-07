import { useEffect, useLayoutEffect, useState } from "react";

import { TokenService, type TokenType } from "@/app/_libs/services/token.service";

interface UseAuthTokenResult {
  /** `null` while the initial check is in flight — the cookie isn't readable during SSR, so this is deferred to an effect to avoid a hydration mismatch. */
  hasToken: boolean | null;
  /** Which principal the session belongs to; routing only, not a security boundary (the backend checks every request). */
  tokenType: TokenType | null;
}

// A layout effect so the check resolves before paint (no flash of guarded content before the
// redirect); guarded for SSR, where `useLayoutEffect` would warn.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * A synchronous read of the non-credential `session` cookie the backend sets on every sign-in
 * (see `TokenService.getTokenType`), never a network call. The cookie lives as long as its session,
 * so a server-side redirect after Google sign-in already has it; reading a JWT from `localStorage`
 * could disagree with the cookies the backend and edge middleware use and caused redirect loops.
 */
export function useAuthToken(): UseAuthTokenResult {
  const [state, setState] = useState<UseAuthTokenResult>({ hasToken: null, tokenType: null });

  useIsomorphicLayoutEffect(() => {
    const tokenType = TokenService.getTokenType();
    setState({ hasToken: tokenType !== null, tokenType });
  }, []);

  return state;
}
