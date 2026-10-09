"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { LuArrowUpRight, LuCreditCard, LuSettings } from "react-icons/lu";
import { toast } from "sonner";

import { ChooseActiveLocationCard } from "@/app/(dashboard)/settings/_components/choose-active-location-card";
import { ManageBillingDialog } from "@/app/(dashboard)/settings/_components/manage-billing-dialog";
import { ReceiptsHistoryCard } from "@/app/(dashboard)/settings/_components/receipts-history-card";
import { DATE_FORMAT } from "@/app/_libs/utils/date";
import { formatCardExpiryMonth } from "@/app/_libs/utils/payment-method";
import { ConfirmActionButton } from "@/components/common/confirm-action-dialog";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingPlans } from "@/hooks/billing/use-billing-plans";
import { useCancelSubscription } from "@/hooks/billing/use-cancel-subscription";
import { useCreateCheckoutSession } from "@/hooks/billing/use-create-checkout-session";
import { useReceipts } from "@/hooks/billing/use-receipts";
import { useSubscription } from "@/hooks/billing/use-subscription";
import { useBusinessSwitcher } from "@/hooks/connections/use-business-switcher";
import type { PaymentMethodSummary } from "@/types/domain";

interface UsageRowProps {
  label: string;
  used: number;
  max: number | null;
}

/** `unlimitedLabel` never applies: an unlimited dimension just shows the raw usage count. */
function UsageRow({ label, used, max }: UsageRowProps) {
  const percent = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{max === null ? used : `${used} / ${max}`}</span>
      </div>
      {max !== null ? <Progress value={percent} /> : null}
    </div>
  );
}

/** Masked card metadata only, so no PCI scope; `brand` is capitalized via CSS because Stripe reports it lowercase. */
function PaymentMethodRow({ paymentMethod }: { paymentMethod: PaymentMethodSummary }) {
  const t = useTranslations("settings.billing.paymentMethod");
  const expiry = formatCardExpiryMonth(paymentMethod.expMonth);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-[13px]">{t("label")}</span>
      <div className="flex items-center gap-2 text-[13px]">
        <span className="font-medium capitalize">
          {t("card", { brand: paymentMethod.brand, last4: paymentMethod.last4 })}
        </span>
        <span className="text-muted-foreground">
          {t("expires", { month: expiry, year: paymentMethod.expYear })}
        </span>
      </div>
    </div>
  );
}

/**
 * Owner-only. Mounted while the payment flag is on OR the tenant is already Paid: the flag only gates starting a new
 * checkout, never a Paid tenant's ability to see or cancel a subscription that keeps renewing on Stripe.
 */
export function BillingSettingsSection() {
  const t = useTranslations("settings.billing");
  const format = useFormatter();
  const { data: subscription, isLoading, isError, refetch } = useSubscription();
  const { data: plansResult } = useBillingPlans();
  const { data: receipts } = useReceipts();
  // Same pool as the Business Switcher, reused instead of a second `useQuery` on the same key.
  const { locations: connectedLocations } = useBusinessSwitcher();
  const checkoutMutation = useCreateCheckoutSession();
  const cancelMutation = useCancelSubscription();
  const tToasts = useTranslations("settings.billing.toasts");
  const tCancelDialog = useTranslations("settings.billing.cancelDialog");
  const [manageBillingOpen, setManageBillingOpen] = useState(false);
  // Hidden as soon as `cancelMutation` succeeds: the webhook that flips `cancelAtPeriodEnd` can land later, and
  // "Cancel subscription" must not be clickable again in that gap.
  const [cancelRequested, setCancelRequested] = useState(false);
  // Synchronous re-entrancy guards: `mutation.isPending` flips only after a React state round-trip, so a fast
  // double-click can call `mutate()` twice.
  const checkoutStarted = useRef(false);

  if (isLoading) return <Skeleton className="h-72 w-full max-w-3xl rounded-xl" />;
  if (isError || !subscription) return <LoadErrorState onRetry={() => void refetch()} />;

  const isPaid = subscription.planCode === "paid";
  const freePlan = plansResult?.plans.find((plan) => plan.code === "free");
  const connectedLocationCount = connectedLocations.length;

  // Reactive: already on a capped plan holding more connections than it allows (some already `billing_paused_at`-paused).
  const overCapReactive =
    subscription.maxLocations !== null && connectedLocationCount > subscription.maxLocations;
  // Proactive: still Paid but canceled. Compares against Free's cap since `subscription.maxLocations` is null during the grace period.
  const overCapProactive =
    subscription.cancelAtPeriodEnd &&
    freePlan?.maxLocations != null &&
    connectedLocationCount > freePlan.maxLocations;

  const chooseLocationMax = overCapReactive ? subscription.maxLocations : (freePlan?.maxLocations ?? null);

  return (
    <div className="flex flex-col gap-5">
      <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuCreditCard className="text-primary size-4" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t(isPaid ? "plan.paid" : "plan.free")}</p>
              <p className="text-muted-foreground text-[13px]">
                {t(isPaid ? "plan.paidHelper" : "plan.freeHelper")}
              </p>
            </div>
            {isPaid ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setManageBillingOpen(true)}>
                  <LuSettings />
                  {t("manageBilling")}
                </Button>
                {!subscription.cancelAtPeriodEnd && !cancelRequested ? (
                  <ConfirmActionButton
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive/10"
                        disabled={cancelMutation.isPending}>
                        {t("cancelSubscription")}
                      </Button>
                    }
                    title={tCancelDialog("title")}
                    description={tCancelDialog("description")}
                    confirmLabel={tCancelDialog("confirm")}
                    cancelLabel={tCancelDialog("keep")}
                    destructive
                    confirmDisabled={cancelMutation.isPending}
                    onConfirm={() => {
                      if (cancelMutation.isPending) return;
                      cancelMutation.mutate(undefined, {
                        onSuccess: () => {
                          setCancelRequested(true);
                          toast.success(tToasts("cancelSucceeded"));
                        },
                        onError: () => toast.error(tToasts("cancelFailed")),
                      });
                    }}
                  />
                ) : null}
              </div>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  if (checkoutStarted.current) return;
                  checkoutStarted.current = true;
                  checkoutMutation.mutate(undefined, {
                    onSettled: () => {
                      checkoutStarted.current = false;
                    },
                  });
                }}
                disabled={checkoutMutation.isPending}>
                <LuArrowUpRight />
                {t("upgrade")}
              </Button>
            )}
          </div>

          {subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd ? (
            <p className="bg-warning-soft text-warning rounded-md px-3 py-2 text-[13px]">
              {t("cancelNotice", {
                date: format.dateTime(new Date(subscription.currentPeriodEnd), DATE_FORMAT),
              })}
            </p>
          ) : null}

          {subscription.paymentMethod ? (
            <PaymentMethodRow paymentMethod={subscription.paymentMethod} />
          ) : null}

          <div className="flex flex-col gap-4">
            <UsageRow
              label={t("usage.locations")}
              used={subscription.activeLocationCount}
              max={subscription.maxLocations}
            />
            <UsageRow
              label={t("usage.teamMembers")}
              used={subscription.teamMemberCount}
              max={subscription.maxTeamMembers}
            />
            {/* Only rendered once the plan caps the dimension: "0 of 20" for a metric nothing increments yet would read as a broken counter. */}
            {subscription.maxAiDraftsPerMonth !== null ? (
              <UsageRow
                label={t("usage.aiDrafts")}
                used={subscription.aiDraftsUsedThisMonth}
                max={subscription.maxAiDraftsPerMonth}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {(overCapReactive || overCapProactive) && chooseLocationMax !== null ? (
        <ChooseActiveLocationCard
          locations={connectedLocations}
          proactive={overCapProactive && !overCapReactive}
          maxLocations={chooseLocationMax}
        />
      ) : null}

      {receipts && receipts.length > 0 ? <ReceiptsHistoryCard receipts={receipts} /> : null}

      <ManageBillingDialog open={manageBillingOpen} onOpenChange={setManageBillingOpen} />
    </div>
  );
}
