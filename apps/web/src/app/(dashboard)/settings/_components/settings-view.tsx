"use client";


import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import {
  LuBan,
  LuBell,
  LuCreditCard,
  LuPlug,
  LuSettings2,
  LuSparkles,
  LuUser,
  LuUsers,
} from "react-icons/lu";


import { AiSettingsSection } from "@/app/(dashboard)/settings/_components/ai-settings-section";
import { BillingSettingsSection } from "@/app/(dashboard)/settings/_components/billing-settings-section";
import { BlocklistSettingsSection } from "@/app/(dashboard)/settings/_components/blocklist-settings-section";
import { ConnectionSettingsSection } from "@/app/(dashboard)/settings/_components/connection-settings-section";
import { GeneralSettingsSection } from "@/app/(dashboard)/settings/_components/general-settings-section";
import { MembersSettingsSection } from "@/app/(dashboard)/settings/_components/members-settings-section";
import { NotificationsSettingsSection } from "@/app/(dashboard)/settings/_components/notifications-settings-section";
import { ProfileSettingsSection } from "@/app/(dashboard)/settings/_components/profile-settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCheckoutReconciliation } from "@/hooks/billing/use-checkout-reconciliation";
import { useSubscription } from "@/hooks/billing/use-subscription";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";
import { useSettings } from "@/hooks/settings/use-settings";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

function SettingsSkeleton() {
  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex max-w-3xl flex-col gap-5">
        <Skeleton className="h-9 w-full sm:w-fit sm:min-w-96" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Every tab this screen renders — used to reject an unknown `?tab=` rather than showing nothing. */
const TABS = [
  "general",
  "profile",
  "members",
  "blocklist",
  "notifications",
  "connection",
  "ai",
  "billing",
] as const;

export function SettingsView() {
  const t = useTranslations("settings");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Every tab but Profile and Members reads from `GET /v1/settings`, which is
  // `@Roles(UserRole.OWNER)` on the backend — a `member` caller gets a 403 there today, the exact
  // shape of route this invite feature was the first to make reachable by a non-owner. `enabled`
  // below stops `useSettings()` from ever making that doomed request for one.
  const { profile } = useTenantOwnerProfile();
  const isMember = profile?.role === "member";
  const {
    settings,
    isLoading,
    saveGeneral,
    addBlocklistTerm,
    removeBlocklistTerm,
    updateRecipientChannel,
    toggleRecipientActive,
    disconnect,
  } = useSettings(!isMember);
  // Deliberately NOT part of the loading gate below (nor `settings` itself, which is required):
  // General/Blocklist/Notifications/Connection/AI need nothing from it, only whether the
  // Profile/Members tabs are offered does. Gating the whole page on it meant a failed
  // `GET /v1/settings/platform-config` — which runs with `retry: false` and never recovers on its
  // own — left every tab permanently stuck on a skeleton. Treating it as "not yet known" (same as
  // still loading) and simply not offering those two tabs yet degrades far more gracefully.
  const { data: platformSettings } = usePlatformSettings();
  // Same reasoning as `useSettings(!isMember)` above — `GET /v1/billing/subscription` is also
  // owner-only on the backend.
  const { data: subscription } = useSubscription(!isMember);
  // One-shot: reconciles billing status against Stripe when the browser lands back here from a
  // Checkout success redirect — see that hook's own doc comment. A no-op on every other render
  // (neither `checkout=success` nor `session_id` is present).
  useCheckoutReconciliation();
  /**
   * The Billing tab's own availability rule — deliberately broader than a bare
   * `platformSettings.paymentFeatureEnabled` check. That flag only gates *starting a new
   * checkout* on the backend (`BillingService.createCheckoutSession`); it was never meant to
   * revoke an already-Paid tenant's ability to see or cancel a subscription that keeps
   * auto-renewing regardless of this app's own flag — Stripe has no idea the flag exists. Hiding
   * the tab outright for a tenant already on Paid would strand them: still being charged every
   * cycle, with no in-app way to even see that, let alone stop it. A Free tenant still only sees
   * this tab (and its "Upgrade" button, which would otherwise just 403) while the flag is on.
   */
  const billingTabAvailable =
    platformSettings?.paymentFeatureEnabled === true || subscription?.planCode === "paid";

  /**
   * `Tabs` is **controlled from the URL** (mirrors `AdminSettingsView`'s identical pattern) —
   * `?tab=` is the single source of truth for which tab is showing, and clicking a tab writes it
   * back. This also covers the OAuth callback redirecting to
   * `/settings?tab=connection&connected=1` after a reconnect: the tenant lands wherever the URL
   * says, not on a hardcoded default.
   *
   * An earlier, uncontrolled shape (`defaultValue={initialTab}` plus `key={initialTab}` to force a
   * remount when the resolved tab changed) broke in two ways a controlled `Tabs` doesn't: clicking
   * a tab was invisible to `initialTab` (which only reads the URL) until the URL sync round-tripped
   * back through a remount, and that remount reset anything else `TabsList`/`TabsContent` carried
   * as local state — including the tab strip's own horizontal scroll position, so scrolling right to
   * reach a later tab and clicking it snapped the strip back to the start. `AppShell` renders an
   * entirely different element tree per `useBreakpoint()` bucket (mobile vs. tablet/desktop — see
   * its own file), so crossing a breakpoint while resizing the window still unmounts and remounts
   * this whole page — but a controlled `Tabs` recovers from that for free, by simply re-reading the
   * same URL on the fresh mount, with no `key` trick and no in-between remount on every click.
   */
  /**
   * Falls back to "general" not just for an unknown `?tab=`, but also for "profile"/"members"
   * when that tab isn't actually available (passwordLoginEnabled/inviteMembersEnabled off) —
   * requesting a tab with no matching `TabsTrigger` would otherwise leave Radix with nothing
   * selected at all (a blank Settings page), which is exactly what happens if a stale link/bookmark
   * carries `?tab=profile` from before a Super Admin turned password login off.
   */
  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(() => {
    if (!TABS.includes(requestedTab as (typeof TABS)[number])) return "general";
    if (requestedTab === "profile" && !platformSettings?.passwordLoginEnabled) return "general";
    if (requestedTab === "members" && !platformSettings?.inviteMembersEnabled) return "general";
    if (requestedTab === "billing" && !billingTabAvailable) return "general";
    // `TABS.includes` above already confirmed membership; it just doesn't narrow `requestedTab`'s
    // `string | null` type for TypeScript the way a custom type guard would.
    return requestedTab!;
  }, [
    requestedTab,
    platformSettings?.passwordLoginEnabled,
    platformSettings?.inviteMembersEnabled,
    billingTabAvailable,
  ]);

  const handleTabChange = useCallback(
    (value: string) => {
      // `typedRoutes` cannot see that this interpolation only ever produces `/settings?tab=` plus
      // one of the `TABS` literals — same narrow, intentional cast `AdminSettingsView`'s own
      // `handleTabChange` uses for the identical pattern.
      router.replace(`${pathname}?tab=${value}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  if (isMember) {
    // Profile is the one tab this route ever offers a member — every other tab reads from
    // `GET /v1/settings`, `@Roles(UserRole.OWNER)` on the backend, and that query is disabled
    // entirely for a member (see the `useSettings()` call above), so `settings` never loads for
    // one. Returning here, ahead of the `!settings` skeleton-gate below, is what stops that from
    // reading as a permanently-stuck loading state instead of ever reaching a tab. Still gated on
    // `passwordLoginEnabled`, same as the owner path: a member's Profile tab has nothing to show
    // when password sign-in itself is off platform-wide.
    if (!platformSettings?.passwordLoginEnabled) {
      return (
        <div className="p-fluid-page flex flex-col gap-6">
          <p className="text-muted-foreground text-sm">{t("noSettingsForMember")}</p>
        </div>
      );
    }

    return (
      <div className="p-fluid-page flex flex-col gap-6">
        <Tabs defaultValue="profile" className="max-w-3xl gap-5">
          <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide px-1 sm:w-fit sm:max-w-full [&>[data-slot=tabs-trigger]]:flex-none">
            <TabsTrigger value="profile">
              <LuUser />
              {t("tabs.profile")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <ProfileSettingsSection />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  if (isLoading || !settings) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="p-fluid-page flex flex-col gap-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="max-w-3xl gap-5">
        <TabsList className="w-full justify-start overflow-x-auto scrollbar-hide px-1 sm:w-fit sm:max-w-full [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="general">
            <LuSettings2 />
            {t("tabs.general")}
          </TabsTrigger>
          {platformSettings?.passwordLoginEnabled ? (
            <TabsTrigger value="profile">
              <LuUser />
              {t("tabs.profile")}
            </TabsTrigger>
          ) : null}
          {platformSettings?.inviteMembersEnabled ? (
            <TabsTrigger value="members">
              <LuUsers />
              {t("tabs.members")}
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="blocklist">
            <LuBan />
            {t("tabs.blocklist")}
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <LuBell />
            {t("tabs.notifications")}
          </TabsTrigger>
          <TabsTrigger value="connection">
            <LuPlug />
            {t("tabs.connection")}
          </TabsTrigger>
          <TabsTrigger value="ai">
            <LuSparkles />
            {t("tabs.ai")}
          </TabsTrigger>
          {billingTabAvailable ? (
            <TabsTrigger value="billing">
              <LuCreditCard />
              {t("tabs.billing")}
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="general">
          <GeneralSettingsSection general={settings.general} onSave={saveGeneral} />
        </TabsContent>

        <TabsContent value="blocklist">
          <BlocklistSettingsSection
            terms={settings.blocklistTerms}
            onAddTerm={addBlocklistTerm}
            onRemoveTerm={removeBlocklistTerm}
          />
        </TabsContent>

        <TabsContent value="notifications">
          <NotificationsSettingsSection
            recipients={settings.notificationRecipients}
            onChannelChange={updateRecipientChannel}
            onToggleActive={toggleRecipientActive}
          />
        </TabsContent>

        <TabsContent value="connection">
          <ConnectionSettingsSection connection={settings.connection} onDisconnect={disconnect} />
        </TabsContent>

        <TabsContent value="ai">
          <AiSettingsSection
            aiReplyCount={settings.general.aiReplyCount}
            onReplyCountChange={(aiReplyCount) => saveGeneral({ aiReplyCount })}
          />
        </TabsContent>

        {platformSettings?.passwordLoginEnabled ? (
          <TabsContent value="profile">
            <ProfileSettingsSection />
          </TabsContent>
        ) : null}

        {platformSettings?.inviteMembersEnabled ? (
          <TabsContent value="members">
            <MembersSettingsSection />
          </TabsContent>
        ) : null}

        {billingTabAvailable ? (
          <TabsContent value="billing">
            <BillingSettingsSection />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
