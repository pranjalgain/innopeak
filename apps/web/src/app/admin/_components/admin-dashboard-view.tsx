"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { AdminOverviewView } from "@/app/admin/_components/admin-overview-view";
import { AdminStatisticsView } from "@/app/admin/_components/admin-statistics-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Both tabs are read-only platform-analytics views of the same underlying data (Overview's four
 *  headline cards vs. Statistics' deeper trend/breakdown charts) — the same "quick glance vs.
 *  drill in" task, so they live under one URL as tabs rather than as separate top-level nav items.
 *  Businesses/Users/Billing stay separate: those are resource-management screens with their own
 *  filters and actions, a different task shape than a dashboard. */
const TABS = ["overview", "statistics"] as const;

/** Same URL-controlled-tabs pattern as `AdminSettingsView` — see that component's own doc comment
 *  for why the URL, not local state, has to be the single source of truth (a `?tab=` link clicked
 *  while already on this page needs the already-mounted `Tabs` to actually react). `replace`, not
 *  `push`, so switching tabs doesn't pollute Back history. */
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
      // Same narrow-cast reasoning as `AdminSettingsView.handleTabChange` — `pathname` is this
      // component's own route and `value` only ever comes from `TabsTrigger`s built from TABS.
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
