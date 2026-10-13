"use client";

import { useTranslations } from "next-intl";
import { LuCircleAlert, LuClock } from "react-icons/lu";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { CheckoutOutcome } from "@/hooks/billing/use-checkout-reconciliation";

interface CheckoutStatusBannerProps {
  outcome: CheckoutOutcome;
  isChecking: boolean;
  onRecheck: () => void;
}

/** Shown after returning from Checkout while the plan isn't Paid yet; unlike a toast it stays until payment is confirmed. */
export function CheckoutStatusBanner({ outcome, isChecking, onRecheck }: CheckoutStatusBannerProps) {
  const t = useTranslations("settings.billing.checkoutStatus");

  if (!outcome) return null;

  const isFailed = outcome === "failed" || outcome === "notFound";
  const Icon = isFailed ? LuCircleAlert : LuClock;
  const title =
    outcome === "notFound" ? t("notFoundTitle") : isFailed ? t("failedTitle") : t("pendingTitle");
  const description =
    outcome === "notFound"
      ? t("notFoundDescription")
      : isFailed
        ? t("failedDescription")
        : t("pendingDescription");

  return (
    <Alert variant={isFailed ? "destructive" : "default"} className="mb-4">
      <Icon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{description}</p>
        {outcome === "notFound" ? null : (
          <Button type="button" size="sm" variant="outline" disabled={isChecking} onClick={onRecheck}>
            {isChecking ? t("checking") : t("checkAgain")}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
