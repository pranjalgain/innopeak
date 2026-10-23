"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { PlatformActivityLogCard } from "@/app/admin/activity/_components/platform-activity-log-card";
import { BillingWebhookEventsCard } from "@/app/admin/billing/_components/billing-webhook-events-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminHasPaidTenants } from "@/hooks/admin/use-admin-has-paid-tenants";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

/**
 * Same URL-as-source-of-truth pattern as `AdminSettingsView`. Two tabs rather than one merged feed
 * (admin actions vs. Stripe deliveries), each owning its own paginated fetch.
 */
const TABS = ["platformActivity", "webhookActivity"] as const;

export function AdminActivityView() {
  const t = useTranslations("adminActivity");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Stripe deliveries only exist where billing does. Same rule as the Billing nav item: shown when this deploy has payments on, or
  // while any business is still on Paid (Stripe keeps billing them, so their events still arrive), and hidden while loading to avoid
  // a flash. If either check fails the tab is shown anyway: hiding it would present "no deliveries" for events that may well be
  // arriving, while an empty or failing tab says so itself.
  const { data: platformSettings, isError: settingsFailed } = usePlatformSettings();
  const { data: hasPaidTenants, isError: paidTenantsFailed } = useAdminHasPaidTenants();
  const webhookTabAvailable =
    platformSettings?.paymentFeatureEnabled === true ||
    hasPaidTenants === true ||
    settingsFailed ||
    paidTenantsFailed;

  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(() => {
    if (!TABS.includes(requestedTab as (typeof TABS)[number])) return "platformActivity";
    // A bookmarked link to a tab that is not available lands on the first tab instead of showing nothing.
    if (requestedTab === "webhookActivity" && !webhookTabAvailable) return "platformActivity";
    return requestedTab!;
  }, [requestedTab, webhookTabAvailable]);

  const handleTabChange = useCallback(
    (value: string) => {
      // `replace`: a tab is a view of one page, and an arrow-key walk along the strip would otherwise push a history entry per key.
      router.replace(`${pathname}?tab=${value}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="p-fluid-page">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-5">
        {/* A tab bar with a single tab has nothing to switch between, and the card below carries its own title and description. */}
        {webhookTabAvailable ? (
          <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide px-1 sm:w-fit sm:max-w-full [&>[data-slot=tabs-trigger]]:flex-none">
            <TabsTrigger value="platformActivity">{t("tabs.platformActivity")}</TabsTrigger>
            <TabsTrigger value="webhookActivity">{t("tabs.webhookActivity")}</TabsTrigger>
          </TabsList>
        ) : null}

        <TabsContent value="platformActivity">
          <PlatformActivityLogCard />
        </TabsContent>

        {webhookTabAvailable ? (
          <TabsContent value="webhookActivity">
            <BillingWebhookEventsCard />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
