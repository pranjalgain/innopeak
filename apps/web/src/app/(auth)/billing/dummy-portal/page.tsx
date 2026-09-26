"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LuTriangleAlert } from "react-icons/lu";

import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { RequireAuth } from "@/app/_components/require-auth";
import { ROUTES } from "@/app/_libs/constants/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCancelSubscription } from "@/hooks/billing/use-cancel-subscription";
import { useSubscription } from "@/hooks/billing/use-subscription";

/** Where the backend's own `BILLING_REDIRECT_PATHS.PORTAL_RETURN` points — kept in sync by hand
 *  since that constant isn't shared with the frontend build. */
const PORTAL_RETURN_PATH = `${ROUTES.SETTINGS}?tab=billing`;

/**
 * `DummyPaymentProvider.createPortalSession` points here instead of a real Stripe Customer Portal
 * redirect — this page stands in for the whole portal, so "Cancel subscription" is the one action
 * it offers (a simple inline confirm, not customer-facing polish; mirrors the confirm pattern in
 * `ConnectionSettingsSection`'s disconnect action). It calls the same owner-authenticated,
 * provider-agnostic `POST /v1/billing/cancel` the Settings page's own "Cancel subscription"
 * button uses, then returns to `BILLING_REDIRECT_PATHS.PORTAL_RETURN` on success.
 *
 * Lives under `(auth)`, not `(dashboard)` — see `dummy-checkout/page.tsx`'s own comment on why:
 * a real Stripe-hosted Portal page has no dashboard chrome either, and this page must also stay
 * reachable for a tenant who has not connected a business yet.
 *
 * Gated on `subscription.paymentProvider === "dummy"`: nothing about the URL itself ties it to the
 * Dummy provider (unlike `/billing/dummy/complete-checkout` on the backend, which 404s outside
 * `PAYMENT_PROVIDER=dummy`), and `POST /v1/billing/cancel` behind it genuinely cancels a real
 * Stripe subscription too — so a Stripe-provider tenant landing here via a stale bookmark or a
 * crafted link could otherwise cancel their real subscription through a page styled and worded as
 * a disposable dev tool, with no plan-specific context and a `customerId` reference that's only
 * ever read from the query string (never validated) and so is trivially spoofable. A Stripe tenant
 * is bounced back to the real Settings → Billing page instead, where the actual cancel flow lives.
 */
function DummyPortalPage() {
  const t = useTranslations("settings.billing.dummyPortal");
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customerId");
  const [isConfirming, setIsConfirming] = useState(false);
  const { mutate, isPending, isError } = useCancelSubscription();
  const { data: subscription, isLoading: isSubscriptionLoading } = useSubscription();

  const isWrongProvider = !isSubscriptionLoading && subscription?.paymentProvider !== "dummy";

  useEffect(() => {
    if (isWrongProvider) {
      // `typedRoutes` can't see that `PORTAL_RETURN_PATH` only ever produces `/settings?tab=billing`.
      router.replace(PORTAL_RETURN_PATH as Route);
    }
  }, [isWrongProvider, router]);

  const handleCancel = () => {
    mutate(undefined, {
      // Full-page redirect, not `router.push` — see the matching comment on the dummy-checkout
      // page for why.
      onSuccess: () => {
        window.location.href = PORTAL_RETURN_PATH;
      },
    });
  };

  if (isSubscriptionLoading || isWrongProvider) {
    return <Skeleton className="h-56 w-full max-w-md rounded-xl" />;
  }

  return (
    <>
      <AuthLogo />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuTriangleAlert className="text-warning size-4" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {customerId ? (
            <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 font-mono text-[12px]">
              {t("reference", { id: customerId })}
            </p>
          ) : null}

          {isError ? (
            <p className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-[13px]">
              {t("cancelFailed")}
            </p>
          ) : null}

          {!isConfirming ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setIsConfirming(true)}>
                {t("cancelSubscription")}
              </Button>
              <Button asChild variant="outline" className="w-fit">
                <Link href={`${ROUTES.SETTINGS}?tab=billing`}>{t("backToBilling")}</Link>
              </Button>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in-95 bg-destructive-soft ease-fluid flex items-center gap-3 rounded-lg px-4 py-3 duration-300">
              <p className="flex-1 text-[13px] font-medium">{t("cancelConfirm")}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => setIsConfirming(false)}>
                {t("keepSubscription")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={handleCancel}>
                {t("cancelSubscription")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function DummyPortalRoute() {
  return (
    <RequireAuth>
      <DummyPortalPage />
    </RequireAuth>
  );
}
