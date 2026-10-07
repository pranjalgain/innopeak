"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";

import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { RequireAuth } from "@/app/_components/require-auth";
import { ROUTES } from "@/app/_libs/constants/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompleteDummyCheckout } from "@/hooks/billing/use-complete-dummy-checkout";

/**
 * Mirrors the backend's `BILLING_REDIRECT_PATHS.CHECKOUT_SUCCESS`, which isn't shared with the
 * frontend build; keep in sync by hand.
 */
const CHECKOUT_SUCCESS_PATH = `${ROUTES.SETTINGS}?tab=billing&checkout=success`;

/**
 * Target of `DummyPaymentProvider.createCheckoutSession` in place of a Stripe redirect. On mount it
 * calls the dummy-only `POST /v1/billing/dummy/complete-checkout` with the carried
 * `subscriptionId`, applying the state transition a Stripe webhook would (the dummy provider has no
 * webhook caller), then continues to `BILLING_REDIRECT_PATHS.CHECKOUT_SUCCESS`, or shows an error
 * and a way back.
 *
 * Under `(auth)`, not `(dashboard)`: a first-time upgrader from `/onboarding/plan` has not
 * connected a business, and `ConnectionGuard` would bounce them to `/onboarding/connect` before the
 * completion call ran.
 */
function DummyCheckoutPage() {
  const t = useTranslations("settings.billing.dummyCheckout");
  const searchParams = useSearchParams();
  const subscriptionId = searchParams.get("subscriptionId");
  const { mutateAsync } = useCompleteDummyCheckout();
  const [status, setStatus] = useState<"pending" | "error">("pending");
  // Guards against Strict Mode's double-invoked effect firing this side-effecting call twice.
  const hasStarted = useRef(false);

  // The outcome is read off the promise `mutateAsync` returns, not the observer or a per-call
  // `onSuccess`: Strict Mode's remount (and `RequireAuth` re-mounting its child) detaches the
  // observer from an in-flight call, so those are dropped and the page sat on its spinner. A
  // full-page redirect (not `router.push`) guarantees the Billing tab fetches fresh
  // plan/subscription data instead of a pre-upgrade cache.
  const complete = (id: string) => {
    hasStarted.current = true;
    setStatus("pending");
    mutateAsync(id)
      .then(() => {
        window.location.href = CHECKOUT_SUCCESS_PATH;
      })
      .catch(() => setStatus("error"));
  };

  useEffect(() => {
    if (!subscriptionId || hasStarted.current) return;
    complete(subscriptionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId]);

  const showError = !subscriptionId || status === "error";

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
            {status === "error" && subscriptionId ? (
              <Button type="button" variant="outline" onClick={() => complete(subscriptionId)}>
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
