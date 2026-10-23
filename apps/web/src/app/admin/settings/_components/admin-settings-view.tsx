"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { InviteSection } from "@/app/admin/settings/_components/invite-section";
import { PlatformSection } from "@/app/admin/settings/_components/platform-section";
import { ProfileSection } from "@/app/admin/settings/_components/profile-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** All three tabs are always available, so validating `?tab=` only checks membership. */
const TABS = ["profile", "members", "platform"] as const;

export function AdminSettingsView() {
  const t = useTranslations("adminSettings");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * `Tabs` is controlled from the URL (the single source of truth). Uncontrolled `defaultValue` or `key={initialTab}` fail for
   * the account menu's `?tab=profile` link while already here: `initialTab` is "profile" with or without the param, so nothing
   * changed. Writing the tab back on every click makes that link a real URL change; `replace` keeps tab switches out of history.
   */
  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(
    () => (TABS.includes(requestedTab as (typeof TABS)[number]) ? requestedTab! : "profile"),
    [requestedTab],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      // `typedRoutes` can't see that this only produces `/admin/settings?tab=` plus a `TABS` literal.
      // `replace`: a tab is a view of one page, and an arrow-key walk along the strip would otherwise push a history entry per key.
      router.replace(`${pathname}?tab=${value}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="max-w-3xl gap-5">
        <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide px-1 sm:w-fit sm:max-w-full [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
          <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          <TabsTrigger value="platform">{t("tabs.platform")}</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileSection />
        </TabsContent>

        <TabsContent value="members">
          <InviteSection />
        </TabsContent>

        <TabsContent value="platform">
          <PlatformSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
