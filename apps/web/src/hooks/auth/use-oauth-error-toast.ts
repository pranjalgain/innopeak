"use client";

import { useEffect, useRef } from "react";

import { usePathname, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { toast } from "sonner";

const PROVIDERS = ["google", "microsoft"];

/**
 * Surfaces the `?error=` the Google/Microsoft callbacks redirect back with (it cannot answer with JSON
 * mid-navigation). `?provider=` selects that provider's own wording where it has some ("verify it with
 * Google" vs "ask your Microsoft admin"); codes without one share the neutral copy. Both params are
 * stripped once shown so a refresh cannot replay them, via
 * `history.replaceState` since this is a URL tidy-up, not a navigation (and typed routes reject a
 * bare `pathname`).
 *
 * `shownErrorRef` is keyed on the error string: the effect can re-run for unrelated re-renders
 * while `searchParams` still reports the same error, but a different error later still toasts.
 */
export function useOAuthErrorToast(): void {
  const t = useTranslations("auth.ssoErrors");
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const providerParam = searchParams.get("provider");
  const provider =
    providerParam !== null && PROVIDERS.includes(providerParam) ? providerParam : null;
  const shownErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (error === null || error === shownErrorRef.current) return;
    shownErrorRef.current = error;

    // `t.has` avoids next-intl throwing on a code this build doesn't know (backend deployed ahead).
    const providerKey = provider === null ? null : `${provider}.${error}`;
    const message =
      providerKey !== null && t.has(providerKey)
        ? t(providerKey)
        : t.has(error)
          ? t(error)
          : provider !== null
            ? t(`${provider}.fallback`)
            : t("fallback");
    toast.error(message);
    window.history.replaceState(null, "", pathname);
  }, [error, provider, t, pathname]);
}
