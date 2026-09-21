"use client";


import { useSearchParams } from "next/navigation";

import { useTranslations } from "next-intl";
import { useMemo } from "react";


import { AiSettingsSection } from "@/app/(dashboard)/settings/_components/ai-settings-section";
import { BlocklistSettingsSection } from "@/app/(dashboard)/settings/_components/blocklist-settings-section";
import { ConnectionSettingsSection } from "@/app/(dashboard)/settings/_components/connection-settings-section";
import { GeneralSettingsSection } from "@/app/(dashboard)/settings/_components/general-settings-section";
import { MembersSettingsSection } from "@/app/(dashboard)/settings/_components/members-settings-section";
import { NotificationsSettingsSection } from "@/app/(dashboard)/settings/_components/notifications-settings-section";
import { ProfileSettingsSection } from "@/app/(dashboard)/settings/_components/profile-settings-section";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
] as const;

export function SettingsView() {
  const t = useTranslations("settings");
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

  /**
   * `?tab=` selects the initial tab, because the OAuth callback redirects to
   * `/settings?tab=connection&connected=1` after a reconnect. With a hardcoded
   * `defaultValue="general"` that redirect silently landed on the General tab — the user came back
   * from Google and appeared to be somewhere unrelated to what they had just done.
   *
   * Uncontrolled (`defaultValue`, not `value`) on purpose: the query param decides where the user
   * *lands*, and clicking another tab afterwards must not be undone by the URL still saying
   * `connection`.
   */
  /**
   * Falls back to "general" not just for an unknown `?tab=`, but also for "profile"/"members"
   * when that tab isn't actually available (passwordLoginEnabled/inviteMembersEnabled off) —
   * requesting a tab with no matching `TabsTrigger` would otherwise leave Radix with nothing
   * selected at all (a blank Settings page), which is exactly what happens if a stale link/bookmark
   * carries `?tab=profile` from before a Super Admin turned password login off.
   */
  const requestedTab = searchParams.get("tab");
  const initialTab = useMemo(() => {
    if (!TABS.includes(requestedTab as (typeof TABS)[number])) return "general";
    if (requestedTab === "profile" && !platformSettings?.passwordLoginEnabled) return "general";
    if (requestedTab === "members" && !platformSettings?.inviteMembersEnabled) return "general";
    return requestedTab;
  }, [requestedTab, platformSettings?.passwordLoginEnabled, platformSettings?.inviteMembersEnabled]);

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
          <TabsList className="w-full justify-start overflow-x-auto px-1 sm:w-fit [&>[data-slot=tabs-trigger]]:flex-none">
            <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
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
      {/* `key={initialTab}` — `Tabs` is intentionally uncontrolled (see comment above), but that
          means Radix only ever reads `defaultValue` on mount; a later change to `initialTab` (e.g.
          the account-menu's "Profile" link, clicked while already on Settings on some other tab)
          re-renders this component with a new `initialTab` that an already-mounted `Tabs` simply
          ignores — the URL updates but the visible tab doesn't. Keying on `initialTab` forces a
          full remount whenever the *resolved* tab actually changes, which re-seeds `defaultValue`,
          while still leaving manual tab clicks free to diverge from the URL same as before. */}
      <Tabs key={initialTab} defaultValue={initialTab ?? "general"} className="max-w-3xl gap-5">
        <TabsList className="w-full justify-start overflow-x-auto px-1 sm:w-fit [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
          {platformSettings?.passwordLoginEnabled ? (
            <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger>
          ) : null}
          {platformSettings?.inviteMembersEnabled ? (
            <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger>
          ) : null}
          <TabsTrigger value="blocklist">{t("tabs.blocklist")}</TabsTrigger>
          <TabsTrigger value="notifications">{t("tabs.notifications")}</TabsTrigger>
          <TabsTrigger value="connection">{t("tabs.connection")}</TabsTrigger>
          <TabsTrigger value="ai">{t("tabs.ai")}</TabsTrigger>
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
      </Tabs>
    </div>
  );
}
