"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";
import { useReconcileCheckoutSession } from "@/hooks/billing/use-reconcile-checkout-session";

/** Set when reconciliation did not end in "you're on Paid": `pending` (payment may still be processing), `failed`
 *  (Stripe could not be asked) or `notFound` (the session isn't one of this business's, so asking again cannot help).
 *  Drives the banner that outlives the toast. */
export type CheckoutOutcome = "pending" | "failed" | "notFound" | null;

interface UseCheckoutReconciliationResult {
  outcome: CheckoutOutcome;
  isChecking: boolean;
  /** Re-asks Stripe for the session this page was opened with; the URL params are gone by then. */
  recheck: () => void;
}

export function useCheckoutReconciliation(): UseCheckoutReconciliationResult {
  const t = useTranslations("settings.billing.toasts");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { mutateAsync } = useReconcileCheckoutSession();
  const handledSessionIdRef = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<CheckoutOutcome>(null);
  const [isChecking, setIsChecking] = useState(false);

  const lastSessionIdRef = useRef<string | null>(null);

  // The outcome comes from the promise `mutateAsync` returns, not per-call `mutate()` callbacks:
  // under React Strict Mode the observer is detached from the in-flight call and those callbacks
  // are silently dropped (no toast, params never stripped). The promise is unaffected.
  const reconcile = useCallback(
    async (id: string) => {
      lastSessionIdRef.current = id;
      setIsChecking(true);
      try {
        const subscription = await mutateAsync(id);
        // A 200 only means Stripe was reachable; the session may have no live subscription yet, and
        // claiming Paid would contradict the Billing tab beneath the toast.
        if (subscription.planCode === "paid") {
          setOutcome(null);
          toast.success(t("checkoutReconciled"));
        } else {
          setOutcome("pending");
          toast.info(t("checkoutReconcilePending"));
        }
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 404) {
          setOutcome("notFound");
          toast.error(t("checkoutReconcileNotFound"));
        } else {
          setOutcome("failed");
          toast.error(t("checkoutReconcileFailed"));
        }
      } finally {
        setIsChecking(false);
      }
    },
    [mutateAsync, t],
  );

  const checkout = searchParams.get("checkout");
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (checkout !== "success" || !sessionId || sessionId === handledSessionIdRef.current) return;
    handledSessionIdRef.current = sessionId;

    // Stripped only once the request settles (after retries): a refresh mid-request, or after
    // closing the tab, still carries the params and simply reconciles again.
    const stripParams = () => {
      const remaining = new URLSearchParams(searchParams.toString());
      remaining.delete("checkout");
      remaining.delete("session_id");
      const query = remaining.toString();
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
    };

    void reconcile(sessionId).finally(stripParams);
  }, [checkout, sessionId, reconcile, router, pathname, searchParams]);

  const recheck = useCallback(() => {
    if (lastSessionIdRef.current) void reconcile(lastSessionIdRef.current);
  }, [reconcile]);

  return { outcome, isChecking, recheck };
}
