"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { AdminOverviewView } from "@/app/admin/_components/admin-overview-view";
import { AdminStatisticsView } from "@/app/admin/_components/admin-statistics-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Overview and Statistics are one "glance vs. drill in" task, so they share a URL as tabs rather
// than separate nav items; Businesses/Users/Billing are resource-management screens.
const TABS = ["overview", "statistics"] as const;

/** The URL, not local state, drives the tab so a `?tab=` link clicked on this page reacts; `replace` keeps Back history clean. */
export function AdminDashboardView() {
  const t = useTranslations("adminOverview.tabs");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(
    () => (TABS.includes(requestedTab as (typeof TABS)[number]) ? requestedTab! : "overview"),
    [requestedTab],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      // Cast is safe: `pathname` is this route and `value` comes from TABS triggers.
      router.replace(`${pathname}?tab=${value}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-5">
        <TabsList>
          <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
          <TabsTrigger value="statistics">{t("statistics")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <AdminOverviewView />
        </TabsContent>

        <TabsContent value="statistics">
          <AdminStatisticsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
