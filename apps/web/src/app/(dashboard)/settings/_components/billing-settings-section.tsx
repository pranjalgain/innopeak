"use client";

import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { LuArrowUpRight, LuCreditCard, LuDownload, LuMapPin, LuReceipt, LuSettings } from "react-icons/lu";
import { toast } from "sonner";

import { ManageBillingDialog } from "@/app/(dashboard)/settings/_components/manage-billing-dialog";
import { type ConnectedLocation, ConnectionService } from "@/app/_libs/services/connection.service";
import { ConfirmActionButton } from "@/components/common/confirm-action-dialog";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingPlans } from "@/hooks/billing/use-billing-plans";
import { useCancelSubscription } from "@/hooks/billing/use-cancel-subscription";
import { useCreateCheckoutSession } from "@/hooks/billing/use-create-checkout-session";
import { useCreatePortalSession } from "@/hooks/billing/use-create-portal-session";
import { useDownloadReceiptPdf } from "@/hooks/billing/use-download-receipt-pdf";
import { useReceipts } from "@/hooks/billing/use-receipts";
import { useSetActiveLocation } from "@/hooks/billing/use-set-active-location";
import { useSubscription } from "@/hooks/billing/use-subscription";
import { connectionLocationsQueryKey } from "@/hooks/connections/use-business-switcher";
import { useConnection } from "@/hooks/connections/use-connection";
import type { PaymentMethodSummary, Receipt } from "@/types/domain";

const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;

/** `amountPaid` is Stripe's own smallest-currency-unit integer (e.g. cents) — divides by 100 to
 *  get the major unit, same simplification `renderReceiptPdf` makes on the backend (correct for
 *  every 2-decimal currency Stripe issues test prices in today). */
function formatReceiptAmount(amountPaid: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
    amountPaid / 100,
  );
}

interface UsageRowProps {
  label: string;
  used: number;
  max: number | null;
}

/** One capped-dimension row — a plain count for an unlimited (`max === null`) dimension, a
 *  count + progress bar for a capped one. `unlimitedLabel` never applies: this repo has no
 *  "0 of unlimited" string to translate, an unlimited dimension just shows the raw usage number. */
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

/** Masked card metadata only (Stripe's own `brand`/`last4`/expiry) — never a raw card number, so
 *  this carries no PCI scope. `brand` renders capitalized via CSS since Stripe reports it
 *  lowercase (`"visa"`). */
function PaymentMethodRow({ paymentMethod }: { paymentMethod: PaymentMethodSummary }) {
  const t = useTranslations("settings.billing.paymentMethod");
  const expiry = `${paymentMethod.expMonth}`.padStart(2, "0");

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

/** Stripe-only payment history — always empty for a Dummy-provider tenant, since there's no real
 *  charge behind it to document. Rendered only when there's at least one receipt, so a Free or
 *  Dummy tenant never sees an empty "Billing history" card. */
function ReceiptsHistoryCard({ receipts }: { receipts: Receipt[] }) {
  const t = useTranslations("settings.billing.receipts");
  const tToasts = useTranslations("settings.billing.toasts");
  const format = useFormatter();
  const downloadMutation = useDownloadReceiptPdf();

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuReceipt className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {receipts.map((receipt) => (
          <div
            key={receipt.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {formatReceiptAmount(receipt.amountPaid, receipt.currency)}
              </span>
              <span className="text-muted-foreground text-[12.5px]">
                {format.dateTime(new Date(receipt.paidAt), DATE_FORMAT)}
                {receipt.invoiceNumber ? ` · ${receipt.invoiceNumber}` : ""}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={downloadMutation.isPending && downloadMutation.variables === receipt.id}
              onClick={() => {
                downloadMutation.mutate(receipt.id, {
                  onError: () => toast.error(tToasts("receiptDownloadFailed")),
                });
              }}>
              <LuDownload />
              {t("download")}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface ChooseActiveLocationCardProps {
  locations: ConnectedLocation[];
  /** True while showing this ahead of an actual downgrade (`cancelAtPeriodEnd`) — same section,
   *  different copy, per the plan's §3a "proactive vs reactive" framing. */
  proactive: boolean;
  maxLocations: number;
}

function ChooseActiveLocationCard({ locations, proactive, maxLocations }: ChooseActiveLocationCardProps) {
  const t = useTranslations("settings.billing.chooseLocation");
  const { setActiveLocation, isUpdating } = useSetActiveLocation();

  const connectedLocations = locations.filter((location) => location.status === "active");
  // `billingPausedAt === null` is the actual billing-pause bookkeeping
  // (`locations.billing_paused_at`), not an approximation — see `ConnectedLocation`'s own comment.
  const currentlyActiveId =
    connectedLocations.find((location) => location.billingPausedAt === null)?.id ?? null;
  const [selected, setSelected] = useState<string | null>(currentlyActiveId);

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuMapPin className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>
          {t(proactive ? "proactiveDescription" : "reactiveDescription", { count: maxLocations })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RadioGroup value={selected ?? undefined} onValueChange={setSelected}>
          {connectedLocations.map((location) => (
            <div key={location.id} className="flex items-start gap-2.5">
              <RadioGroupItem value={location.id} id={`billing-location-${location.id}`} className="mt-0.5" />
              <Label
                htmlFor={`billing-location-${location.id}`}
                className="flex flex-col items-start gap-0.5 font-normal">
                <span className="text-sm font-medium">{location.businessName}</span>
                {location.address ? (
                  <span className="text-muted-foreground text-[12.5px]">{location.address}</span>
                ) : null}
                {location.billingPausedAt === null ? (
                  <span className="text-success text-[12px] font-medium">{t("currentlyActive")}</span>
                ) : (
                  <span className="text-muted-foreground text-[12px] font-medium">{t("paused")}</span>
                )}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <Button
          type="button"
          className="w-fit"
          disabled={!selected || isUpdating}
          onClick={() => {
            if (selected) void setActiveLocation(selected);
          }}>
          {t("confirm")}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Owner-only, mounted while `platformSettings.paymentFeatureEnabled` is true OR the tenant is
 * already on the Paid plan (see `SettingsView`'s `billingTabAvailable` tab gate) — the flag only
 * ever gates *starting a new checkout*, never an already-Paid tenant's ability to see or cancel a
 * subscription that keeps auto-renewing on Stripe's own schedule regardless of this app's flag.
 * Current plan + entitlement usage, the upgrade/manage entry points, and the §3a "choose your
 * active location" section when the tenant is over their plan's cap. The "Upgrade" button (the
 * only entry point the flag actually needs to gate) is only ever reachable here for a Free
 * tenant, and a Free tenant only ever reaches this tab at all while the flag is genuinely on.
 *
 * `ChooseActiveLocationCard` reads each location's real `billingPausedAt` from
 * `GET /v1/connections/locations` (`ConnectionService.listLocations`) for its active/paused badge
 * and default selection — the backend's `toLocationDto` mapping now carries that field through.
 */
export function BillingSettingsSection() {
  const t = useTranslations("settings.billing");
  const format = useFormatter();
  const { data: subscription, isLoading, isError, refetch } = useSubscription();
  const { data: plansResult } = useBillingPlans();
  const { data: receipts } = useReceipts();
  const { state: connectionState } = useConnection();
  const locationsQuery = useQuery({
    queryKey: connectionLocationsQueryKey,
    queryFn: ({ signal }) => ConnectionService.listLocations(signal),
    enabled: connectionState?.connectionId != null,
  });
  const checkoutMutation = useCreateCheckoutSession();
  const portalMutation = useCreatePortalSession();
  const cancelMutation = useCancelSubscription();
  const tToasts = useTranslations("settings.billing.toasts");
  const tCancelDialog = useTranslations("settings.billing.cancelDialog");
  const [manageBillingOpen, setManageBillingOpen] = useState(false);
  // Hidden as soon as `cancelMutation` succeeds, ahead of the subscription refetch actually
  // confirming `cancelAtPeriodEnd` — Stripe's own webhook is what flips that field server-side and
  // can land a moment later, so without this a tenant could still see (and click) "Cancel
  // subscription" again in that gap. See `useCancelSubscription`'s own doc comment.
  const [cancelRequested, setCancelRequested] = useState(false);
  // Synchronous re-entrancy guards for the checkout/portal redirect buttons — `mutation.isPending`
  // only flips true after a React state update round-trip, so a fast double-click (or automation
  // double-fire) landing inside the same task can still call `mutate()` twice before either
  // `disabled` prop re-renders. Mirrors the dummy-checkout page's own `hasStarted` ref guard.
  const checkoutStarted = useRef(false);
  const portalStarted = useRef(false);

  if (isLoading) return <Skeleton className="h-72 w-full max-w-3xl rounded-xl" />;
  if (isError || !subscription) return <LoadErrorState onRetry={() => void refetch()} />;

  const isPaid = subscription.planCode === "paid";
  const freePlan = plansResult?.plans.find((plan) => plan.code === "free");
  const connectedLocations = locationsQuery.data ?? [];
  const connectedLocationCount = connectedLocations.filter(
    (location) => location.status === "active",
  ).length;

  // Reactive: already back on a capped plan and holding more connections than it allows (some are
  // silently `billing_paused_at`-paused server-side already — see this component's top note).
  const overCapReactive =
    subscription.maxLocations !== null && connectedLocationCount > subscription.maxLocations;
  // Proactive: still fully Paid (unlimited) but has canceled — shown ahead of the actual downgrade
  // so there's no surprise auto-pick, per §3a. Compares against the Free plan's own cap, since
  // `subscription.maxLocations` is still `null` (unlimited) during the grace period.
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
                  onClick={() => {
                    // Stripe: manage billing entirely in-app (see ManageBillingDialog's own doc
                    // comment). Dummy: no real Stripe customer to edit, so this keeps the old
                    // redirect to the simulated /billing/dummy-portal confirmation page.
                    if (subscription.paymentProvider === "stripe") {
                      setManageBillingOpen(true);
                      return;
                    }
                    if (portalStarted.current) return;
                    portalStarted.current = true;
                    portalMutation.mutate(undefined, {
                      onSettled: () => {
                        portalStarted.current = false;
                      },
                    });
                  }}
                  disabled={portalMutation.isPending}>
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
            {/* Per the plan's own caveat: no AI-generation pipeline exists yet, so this line only
             *  renders once the plan actually caps the dimension — showing "0 of 20" for a metric
             *  nothing can ever increment yet would read as a broken counter, not an unused one. */}
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
