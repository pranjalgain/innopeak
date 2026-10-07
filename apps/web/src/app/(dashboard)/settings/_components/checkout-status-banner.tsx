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

  const isFailed = outcome === "failed";
  const Icon = isFailed ? LuCircleAlert : LuClock;

  return (
    <Alert variant={isFailed ? "destructive" : "default"} className="mb-4">
      <Icon />
      <AlertTitle>{isFailed ? t("failedTitle") : t("pendingTitle")}</AlertTitle>
      <AlertDescription>
        <p>{isFailed ? t("failedDescription") : t("pendingDescription")}</p>
        <Button type="button" size="sm" variant="outline" disabled={isChecking} onClick={onRecheck}>
          {isChecking ? t("checking") : t("checkAgain")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
