"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";

import { InviteSection } from "@/app/admin/settings/_components/invite-section";
import { PlatformSection } from "@/app/admin/settings/_components/platform-section";
import { ProfileSection } from "@/app/admin/settings/_components/profile-section";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Every tab this screen renders — all three are always available (unlike the tenant Settings
 * page, nothing here is conditionally hidden), so validating `?tab=` only ever needs to check
 * membership, never per-tab availability. */
const TABS = ["profile", "members", "platform"] as const;

export function AdminSettingsView() {
  const t = useTranslations("adminSettings");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * `Tabs` is **controlled from the URL**, and clicking a tab writes the URL back. The URL is the
   * single source of truth for which tab is showing; there is no second copy to fall out of step.
   *
   * Two earlier shapes both failed on the same journey — the account menu's "Profile" row, which
   * links to `${ROUTES.ADMIN_SETTINGS}?tab=profile`, clicked while already on this page:
   *
   *   - a hardcoded `defaultValue="profile"`: an already-mounted uncontrolled `Tabs` never
   *     re-reads `defaultValue`, so the URL changed and the view did not.
   *   - `key={initialTab}` to force a remount: `initialTab` resolves to `"profile"` both when
   *     `?tab=` is absent *and* when it is `?tab=profile`, so for this exact link the key never
   *     changed and no remount happened. It only ever worked on the tenant Settings page because
   *     that one defaults to `"general"`, making `?tab=profile` a genuinely different value.
   *
   * Writing the tab back on every click is what makes the link work at all: it guarantees the URL
   * reads `?tab=platform` while Platform is showing, so navigating to `?tab=profile` is a real
   * change rather than a no-op. `replace` rather than `push` keeps tab switching out of history,
   * so Back still leaves Settings instead of walking the tabs.
   */
  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(
    () => (TABS.includes(requestedTab as (typeof TABS)[number]) ? requestedTab! : "profile"),
    [requestedTab],
  );

  const handleTabChange = useCallback(
    (value: string) => {
      // `typedRoutes` cannot see that this interpolation only ever produces `/admin/settings?tab=`
      // plus one of the three literals in TABS. The cast is narrow on purpose: `pathname` is this
      // component's own route and `value` comes from `TabsTrigger`s built from TABS.
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
