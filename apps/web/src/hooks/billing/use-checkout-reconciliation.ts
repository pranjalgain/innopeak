"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { useReconcileCheckoutSession } from "@/hooks/billing/use-reconcile-checkout-session";

/**
 * Closes the gap a delayed/missed Stripe `checkout.session.completed` webhook would otherwise
 * leave open: `BILLING_REDIRECT_PATHS.CHECKOUT_SUCCESS` carries Stripe's own
 * `{CHECKOUT_SESSION_ID}` success_url template token as `session_id`, substituted with the real
 * id on redirect. The moment the browser lands back here with both `checkout=success` and a
 * `session_id`, this reads the Checkout Session straight from Stripe (`POST
 * /v1/billing/checkout/reconcile`) and applies it — safe even if the webhook already landed first,
 * since that write is idempotent.
 *
 * Ref-guarded, same shape as `useOAuthErrorToast`/`useOnboardingConnectFlow`'s own one-shot
 * redirect handling: the params are stripped via `router.replace` once the request settles
 * (keeping `?tab=billing`, the one param this screen's own tab state still needs), so a completed
 * reconcile cannot be replayed by a refresh. The guard is keyed on the session id itself, not a
 * plain boolean — it keeps the effect from re-firing while the request is still in flight.
 */
export function useCheckoutReconciliation(): void {
  const t = useTranslations("settings.billing.toasts");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mutate } = useReconcileCheckoutSession();
  const handledSessionIdRef = useRef<string | null>(null);

  const checkout = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (checkout !== "success" || !sessionId || sessionId === handledSessionIdRef.current) return;
    handledSessionIdRef.current = sessionId;

    // Params are stripped only once the request settles (after its retries), not up front: while it
    // is in flight — or if the tab is closed mid-request — a refresh still carries them and
    // simply reconciles again.
    const stripParams = () => {
      const remaining = new URLSearchParams(searchParams.toString());
      remaining.delete("checkout");
      remaining.delete("session_id");
      const query = remaining.toString();
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
    };

    mutate(sessionId, {
      onSuccess: (subscription) => {
        // A 200 only means Stripe was reachable — the session may have no live subscription yet
        // (payment still processing), in which case the plan is still Free and saying otherwise
        // would contradict the Billing tab right beneath the toast.
        if (subscription.planCode === "paid") {
          toast.success(t("checkoutReconciled"));
        } else {
          toast.info(t("checkoutReconcilePending"));
        }
      },
      onError: () => toast.error(t("checkoutReconcileFailed")),
      onSettled: stripParams,
    });
  }, [checkout, sessionId, mutate, router, pathname, searchParams, t]);
}
