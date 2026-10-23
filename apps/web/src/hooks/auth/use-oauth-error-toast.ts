"use client";


import { usePathname, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { ROUTES } from "@/app/_libs/constants/routes";

const PROVIDERS = ["google", "microsoft"];

/**
 * Surfaces the `?error=` the Google/Microsoft callbacks redirect back with (it cannot answer with JSON
 * mid-navigation). `?provider=` selects that provider's own wording where it has some ("verify it with
 * Google" vs "ask your Microsoft admin"); codes without one share the neutral copy. On the admin sign-in
 * screen `ssoErrors.admin.<code>` wins where it exists, since "sign up first" is wrong where admins are
 * invited. Both params are stripped once shown (any other, such as a `next` return path, stays) so a refresh cannot replay them, via
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

    // `t.has` avoids next-intl throwing on a code this build doesn't know (backend deployed ahead). It also says yes to a namespace
    // (`?error=google`) or an inherited name (`?error=constructor`) and would toast the key path, so only a code shaped like ours
    // (UPPER_SNAKE) is looked up at all.
    const isCode = /^[A-Z][A-Z0-9_]*$/.test(error);
    const providerKey = provider === null || !isCode ? null : `${provider}.${error}`;
    const adminKey = pathname === ROUTES.ADMIN_LOGIN && isCode ? `admin.${error}` : null;
    const message =
      adminKey !== null && t.has(adminKey)
        ? t(adminKey)
        : providerKey !== null && t.has(providerKey)
          ? t(providerKey)
          : isCode && t.has(error)
            ? t(error)
            : provider !== null
              ? t(`${provider}.fallback`)
              : t("fallback");
    toast.error(message);
    // Only the two params this hook consumed: dropping the whole query would also lose a `next` return path the visitor still needs.
    const remaining = new URLSearchParams(searchParams.toString());
    remaining.delete("error");
    remaining.delete("provider");
    const query = remaining.toString();
    window.history.replaceState(null, "", `${pathname}${query === "" ? "" : `?${query}`}${window.location.hash}`);
  }, [error, provider, t, pathname, searchParams]);
}
