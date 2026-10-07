"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect } from "react";
import { LuBan, LuCircleAlert, LuCircleCheck, LuUsers } from "react-icons/lu";

import { ROUTES } from "@/app/_libs/constants/routes";
import { cn } from "@/app/_libs/utils/cn";
import { AtRiskSubscriptionsPanel } from "@/app/admin/billing/_components/at-risk-subscriptions-panel";
import { PostErasureChargesPanel } from "@/app/admin/billing/_components/post-erasure-charges-panel";
import { UpgradeTrendCard } from "@/app/admin/billing/_components/upgrade-trend-card";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminBilling } from "@/hooks/admin/use-admin-billing";
import { useAdminHasPaidTenants } from "@/hooks/admin/use-admin-has-paid-tenants";
import { useCountUp } from "@/hooks/common/use-count-up";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

export function AdminBillingView() {
  const t = useTranslations("adminBilling");
  const format = useFormatter();
  const router = useRouter();
  // The nav hides this page when payment is off and nothing is on Paid, but the URL still resolves;
  // bounce direct visits to Overview. `billingAvailable` mirrors the nav filter: the flag only gates
  // new checkouts, so the page stays reachable while any Paid tenant exists. Never redirects while a query is loading.
  const { data: platformSettings, isLoading: platformSettingsLoading } = usePlatformSettings();
  const { data: hasPaidTenants, isLoading: hasPaidTenantsLoading } = useAdminHasPaidTenants();
  const settingsResolved = !platformSettingsLoading && !hasPaidTenantsLoading;
  const billingAvailable = platformSettings?.paymentFeatureEnabled === true || hasPaidTenants === true;
  useEffect(() => {
    if (settingsResolved && !billingAvailable) {
      router.replace(ROUTES.ADMIN);
    }
  }, [settingsResolved, billingAvailable, router]);

  const {
    freeCount,
    paidCount,
    activeCount,
    pastDueCount,
    cancelingCount,
    upgradeTrend,
    atRisk,
    postErasureCharges,
    resolvePostErasureCharge,
    isLoading,
    isError,
    refetch,
  } = useAdminBilling();

  const freeCountAnimated = useCountUp(freeCount, isLoading);
  const paidCountAnimated = useCountUp(paidCount, isLoading);
  const activeCountAnimated = useCountUp(activeCount, isLoading);
  const pastDueCountAnimated = useCountUp(pastDueCount, isLoading);

  const stats = [
    { key: "freeCount", value: format.number(freeCountAnimated), icon: LuUsers },
    { key: "paidCount", value: format.number(paidCountAnimated), icon: LuUsers },
    { key: "activeCount", value: format.number(activeCountAnimated), icon: LuCircleCheck },
    { key: "pastDueCount", value: format.number(pastDueCountAnimated), icon: LuCircleAlert },
  ] as const;

  const showAtRisk = atRisk.length > 0;

  // Avoids a flash of the dashboard while the redirect effect decides.
  if (!settingsResolved || !billingAvailable) {
    return null;
  }

  // One summary query backs the whole page, so a failure would otherwise paint several confident zeroes.
  if (isError) {
    return (
      <div className="p-fluid-page">
        <LoadErrorState onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
          : stats.map((stat, index) => (
              <Card
                key={stat.key}
                className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500 ease-fluid"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <CardContent className="flex items-center gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                    <stat.icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {t(`stats.${stat.key}`)}
                    </p>
                    <p className="mt-0.5 text-2xl font-semibold tabular-nums">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {cancelingCount > 0 && !isLoading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LuBan className="size-4 shrink-0" />
          {t("cancelingNotice", { count: cancelingCount })}
        </p>
      )}

      {!isLoading && postErasureCharges.length > 0 && (
        <PostErasureChargesPanel
          charges={postErasureCharges}
          onResolve={resolvePostErasureCharge}
        />
      )}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <div className={cn("grid gap-4", showAtRisk && "lg:grid-cols-2")}>
          {showAtRisk && <AtRiskSubscriptionsPanel subscriptions={atRisk} />}
          <UpgradeTrendCard trend={upgradeTrend} />
        </div>
      )}
    </div>
  );
}
