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
import { CheckoutStatusBanner } from "@/app/(dashboard)/settings/_components/checkout-status-banner";
import { ConnectionSettingsSection } from "@/app/(dashboard)/settings/_components/connection-settings-section";
import { DeleteBusinessSection } from "@/app/(dashboard)/settings/_components/delete-business-section";
import { ExportDataSection } from "@/app/(dashboard)/settings/_components/export-data-section";
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
  // `GET /v1/settings` is owner-only on the backend, so `enabled` keeps a member from making a doomed request.
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
  // Deliberately not part of the loading gate: only Profile/Members need it, and gating on it left every tab stuck on a
  // skeleton when this query (`retry: false`) failed.
  const { data: platformSettings } = usePlatformSettings();
  // Also owner-only on the backend.
  const { data: subscription } = useSubscription(!isMember);
  // One-shot: reconciles with Stripe after a Checkout success redirect; a no-op otherwise.
  const checkoutReconciliation = useCheckoutReconciliation();
  /**
   * Broader than `paymentFeatureEnabled`: that flag only gates starting a checkout, and hiding the tab for a Paid tenant
   * would leave them charged every cycle with no in-app way to cancel.
   */
  const billingTabAvailable =
    platformSettings?.paymentFeatureEnabled === true || subscription?.planCode === "paid";

  /** `Tabs` is controlled from `?tab=`, so OAuth redirects land on the right tab and an AppShell breakpoint remount just re-reads the URL without resetting the tab strip's scroll. */
  /** Falls back to "general" for an unknown tab and for members/notifications/billing when unavailable: a value with no `TabsTrigger` leaves Radix with nothing selected (e.g. a stale bookmark). */
  const requestedTab = searchParams.get("tab");
  const activeTab = useMemo(() => {
    if (!TABS.includes(requestedTab as (typeof TABS)[number])) return "general";
    if (requestedTab === "members" && !platformSettings?.inviteMembersEnabled) return "general";
    if (requestedTab === "notifications" && !platformSettings?.notificationSettingsEnabled) {
      return "general";
    }
    if (requestedTab === "billing" && !billingTabAvailable) return "general";
    // `TABS.includes` doesn't narrow `string | null` for TypeScript.
    return requestedTab!;
  }, [
    requestedTab,
    platformSettings?.inviteMembersEnabled,
    platformSettings?.notificationSettingsEnabled,
    billingTabAvailable,
  ]);

  const handleTabChange = useCallback(
    (value: string) => {
      // `typedRoutes` can't see that this only produces `/settings?tab=` plus a `TABS` literal.
      router.push(`${pathname}?tab=${value}` as Route, { scroll: false });
    },
    [router, pathname],
  );

  if (isMember) {
    // Profile is the only tab offered to a member: the settings query is disabled for them, so return before the
    // `!settings` skeleton gate to avoid a permanent loading state. Not gated on the platform's password switch: that switch only
    // closes new email/password sign-ups, and changing or setting a password stays available to everyone who has an account.
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
          <TabsTrigger value="profile">
            <LuUser />
            {t("tabs.profile")}
          </TabsTrigger>
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
          {platformSettings?.notificationSettingsEnabled ? (
            <TabsTrigger value="notifications">
              <LuBell />
              {t("tabs.notifications")}
            </TabsTrigger>
          ) : null}
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
          <div className="flex flex-col gap-5">
            <GeneralSettingsSection general={settings.general} onSave={saveGeneral} />
            <ExportDataSection />
            <DeleteBusinessSection />
          </div>
        </TabsContent>

        <TabsContent value="blocklist">
          <BlocklistSettingsSection
            terms={settings.blocklistTerms}
            onAddTerm={addBlocklistTerm}
            onRemoveTerm={removeBlocklistTerm}
          />
        </TabsContent>

        {platformSettings?.notificationSettingsEnabled ? (
          <TabsContent value="notifications">
            <NotificationsSettingsSection
              recipients={settings.notificationRecipients}
              onChannelChange={updateRecipientChannel}
              onToggleActive={toggleRecipientActive}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="connection">
          <ConnectionSettingsSection connection={settings.connection} onDisconnect={disconnect} />
        </TabsContent>

        <TabsContent value="ai">
          <AiSettingsSection
            aiReplyCount={settings.general.aiReplyCount}
            onReplyCountChange={(aiReplyCount) => saveGeneral({ aiReplyCount })}
          />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileSettingsSection />
        </TabsContent>

        {platformSettings?.inviteMembersEnabled ? (
          <TabsContent value="members">
            <MembersSettingsSection />
          </TabsContent>
        ) : null}

        {billingTabAvailable ? (
          <TabsContent value="billing">
            <CheckoutStatusBanner
              outcome={checkoutReconciliation.outcome}
              isChecking={checkoutReconciliation.isChecking}
              onRecheck={checkoutReconciliation.recheck}
            />
            <BillingSettingsSection />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
