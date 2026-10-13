"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { PlatformActivityLogCard } from "@/app/admin/activity/_components/platform-activity-log-card";
import { BillingWebhookEventsCard } from "@/app/admin/billing/_components/billing-webhook-events-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(
    () => (TABS.includes(requestedTab as (typeof TABS)[number]) ? requestedTab! : "platformActivity"),
    [requestedTab],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      router.push(`${pathname}?tab=${value}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="p-fluid-page">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-5">
        <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide px-1 sm:w-fit sm:max-w-full [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="platformActivity">{t("tabs.platformActivity")}</TabsTrigger>
          <TabsTrigger value="webhookActivity">{t("tabs.webhookActivity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="platformActivity">
          <PlatformActivityLogCard />
        </TabsContent>

        <TabsContent value="webhookActivity">
          <BillingWebhookEventsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
