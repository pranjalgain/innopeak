"use client";


import { usePathname, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Surfaces the `?error=` the Google callback redirects back with.
 *
 * The callback cannot answer with JSON — the browser is mid-navigation and would render it as a
 * document — so every failure arrives as a query param instead. Without this the whole failure
 * surface is invisible: the user clicks the button, comes back to the same page, and nothing
 * tells them why.
 *
 * The param is stripped once shown, so a refresh cannot replay a stale error. Done with
 * `history.replaceState` rather than `router.replace`: this is a URL tidy-up, not a navigation —
 * it avoids a re-render, and Next's typed routes reject a bare `pathname` string anyway.
 *
 * `shownErrorRef` guards against showing the same error twice. It matters because stripping the
 * param is not itself a dependency of this effect — nothing here re-renders in response to
 * `replaceState`, so this effect can legitimately run again (mount, then React re-rendering this
 * component for an unrelated reason, e.g. `usePlatformSettings` resolving on `LoginView`) while
 * `searchParams` still reports the same `error` it did the first time. Keying the guard on the
 * error string itself, rather than a plain boolean, means a *different* error later in the same
 * session (or the same error again after a fresh Google round trip, which is always a full page
 * load and therefore a fresh ref) still gets its own toast.
 */
export function useOAuthErrorToast(): void {
  const t = useTranslations("auth.googleErrors");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const shownErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (error === null || error === shownErrorRef.current) return;
    shownErrorRef.current = error;

    // `t.has` avoids next-intl throwing on a code this build does not know — a backend deployed
    // ahead of the frontend should degrade to the generic message, not a crash.
    toast.error(t.has(error) ? t(error) : t("fallback"));
    window.history.replaceState(null, "", pathname);
  }, [error, t, pathname]);
}
