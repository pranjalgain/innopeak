"use client";


import { usePathname, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
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
 */
export function useOAuthErrorToast(): void {
  const t = useTranslations("auth.googleErrors");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    if (error === null) return;

    // `t.has` avoids next-intl throwing on a code this build does not know — a backend deployed
    // ahead of the frontend should degrade to the generic message, not a crash.
    toast.error(t.has(error) ? t(error) : t("fallback"));
    window.history.replaceState(null, "", pathname);
  }, [error, t, pathname]);
}
