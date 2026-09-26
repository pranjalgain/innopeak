"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";

import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { RequireAuth } from "@/app/_components/require-auth";
import { ROUTES } from "@/app/_libs/constants/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompleteDummyCheckout } from "@/hooks/billing/use-complete-dummy-checkout";

/** Where the backend's own `BILLING_REDIRECT_PATHS.CHECKOUT_SUCCESS` points — kept in sync by
 *  hand since that constant isn't shared with the frontend build. */
const CHECKOUT_SUCCESS_PATH = `${ROUTES.SETTINGS}?tab=billing&checkout=success`;

/**
 * `DummyPaymentProvider.createCheckoutSession` points here instead of a real Stripe redirect (see
 * `apps/backend/src/api/billing/providers/dummy-payment.provider.ts`'s own doc comment) — its
 * `tenantId`/`customerId`/`subscriptionId` query params are what a real confirmation page reads
 * and hands to the same internal method the Stripe webhook would call for
 * `checkout.session.completed`.
 *
 * Lives under `(auth)`, not `(dashboard)` — a real Stripe-hosted Checkout page has no dashboard
 * chrome either, and critically, a tenant reaching this page for the *first* time (from
 * `/onboarding/plan`'s "Upgrade to Paid", before ever connecting a business) has not connected
 * anything yet. Under `(dashboard)`, `ConnectionGuard` would redirect them straight back to
 * `/onboarding/connect` before this page's own effect ever got to call `complete-checkout` —
 * this only wraps in `RequireAuth` (a real session, nothing about being connected).
 *
 * On mount, this page calls `POST /v1/billing/dummy/complete-checkout` with the `subscriptionId`
 * the redirect carried — the dummy-only, owner-authenticated endpoint that applies that same state
 * transition, since `DummyPaymentProvider` has no external webhook caller of its own to deliver
 * one. On success it continues on to the real success destination
 * (`BILLING_REDIRECT_PATHS.CHECKOUT_SUCCESS`) — which `ConnectionGuard` will itself redirect on to
 * `/onboarding/connect` for a not-yet-connected tenant, now on Paid; on failure it shows an error
 * and a way back rather than silently stranding the owner mid-upgrade.
 */
function DummyCheckoutPage() {
  const t = useTranslations("settings.billing.dummyCheckout");
  const searchParams = useSearchParams();
  const subscriptionId = searchParams.get("subscriptionId");
  const { mutate, isPending, isError } = useCompleteDummyCheckout();
  // Guards against React 18 Strict Mode's double-invoked effect (and a fast re-render) firing this
  // dummy-only, side-effecting completion call twice for the same page load.
  const hasStarted = useRef(false);

  const complete = (id: string) => {
    hasStarted.current = true;
    mutate(id, {
      // A full-page redirect, not `router.push`: this mirrors `useCreateCheckoutSession`'s own
      // outbound redirect and guarantees the Billing tab's plan/subscription queries are fetched
      // fresh rather than possibly serving a pre-upgrade cached read.
      onSuccess: () => {
        window.location.href = CHECKOUT_SUCCESS_PATH;
      },
    });
  };

  useEffect(() => {
    if (!subscriptionId || hasStarted.current) return;
    complete(subscriptionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId]);

  const showError = !subscriptionId || isError;

  return (
    <>
      <AuthLogo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {showError ? (
              <LuTriangleAlert className="text-warning size-4" />
            ) : (
              <LuLoaderCircle className="text-primary size-4 animate-spin" />
            )}
            {showError ? t("errorTitle") : t("title")}
          </CardTitle>
          <CardDescription>
            {showError ? t("errorDescription") : t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {subscriptionId ? (
            <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 font-mono text-[12px]">
              {t("reference", { id: subscriptionId })}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {isError && subscriptionId ? (
              <Button type="button" variant="outline" disabled={isPending} onClick={() => complete(subscriptionId)}>
                {t("retry")}
              </Button>
            ) : null}
            <Button asChild variant={showError ? "default" : "outline"} className="w-fit">
              <Link href={`${ROUTES.SETTINGS}?tab=billing`}>{t("backToBilling")}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function DummyCheckoutRoute() {
  return (
    <RequireAuth>
      <DummyCheckoutPage />
    </RequireAuth>
  );
}
