"use client";


import { usePathname, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Surfaces the `?error=` the Google callback redirects back with (it cannot answer with JSON
 * mid-navigation). The param is stripped once shown so a refresh cannot replay it, via
 * `history.replaceState` since this is a URL tidy-up, not a navigation (and typed routes reject a
 * bare `pathname`).
 *
 * `shownErrorRef` is keyed on the error string: the effect can re-run for unrelated re-renders
 * while `searchParams` still reports the same error, but a different error later still toasts.
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

    // `t.has` avoids next-intl throwing on a code this build doesn't know (backend deployed ahead).
    toast.error(t.has(error) ? t(error) : t("fallback"));
    window.history.replaceState(null, "", pathname);
  }, [error, t, pathname]);
}
