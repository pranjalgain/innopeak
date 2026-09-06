"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AiSettingsSection } from "@/app/(dashboard)/settings/_components/ai-settings-section";
import { BlocklistSettingsSection } from "@/app/(dashboard)/settings/_components/blocklist-settings-section";
import { ConnectionSettingsSection } from "@/app/(dashboard)/settings/_components/connection-settings-section";
import { GeneralSettingsSection } from "@/app/(dashboard)/settings/_components/general-settings-section";
import { MembersSettingsSection } from "@/app/(dashboard)/settings/_components/members-settings-section";
import { NotificationsSettingsSection } from "@/app/(dashboard)/settings/_components/notifications-settings-section";
import { ProfileSettingsSection } from "@/app/(dashboard)/settings/_components/profile-settings-section";
import { AUTH_METHODS } from "@/app/_libs/constants/auth-methods";
import { FEATURE_FLAGS } from "@/app/_libs/constants/feature-flags";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "@/hooks/settings/use-settings";

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      <Skeleton className="h-8 w-32" />
      <div className="flex max-w-3xl flex-col gap-5">
        <Skeleton className="h-9 w-full sm:w-fit sm:min-w-96" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function SettingsView() {
  const t = useTranslations("settings");
  const searchParams = useSearchParams();
  const {
    settings,
    isLoading,
    updateGeneral,
    addBlocklistTerm,
    removeBlocklistTerm,
    updateRecipientChannel,
    toggleRecipientActive,
    disconnect,
  } = useSettings();

  if (isLoading || !settings) return <SettingsSkeleton />;

  // `?tab=` drives the initial tab (e.g. the account menu's "profile" link) — falls back to
  // "general" when the requested tab doesn't exist in the current AUTH_METHODS configuration.
  const requestedTab = searchParams.get("tab");
  const initialTab = requestedTab === "profile" && !AUTH_METHODS.password ? "general" : (requestedTab ?? "general");

  return (
    <div className="flex flex-col gap-6 p-fluid-page">
      <Tabs defaultValue={initialTab} className="max-w-3xl gap-5">
        <TabsList className="w-full justify-start overflow-x-auto px-1 sm:w-fit [&>[data-slot=tabs-trigger]]:flex-none">
          <TabsTrigger value="general">{t("tabs.general")}</TabsTrigger>
          {AUTH_METHODS.password ? <TabsTrigger value="profile">{t("tabs.profile")}</TabsTrigger> : null}
          {FEATURE_FLAGS.inviteMembers ? <TabsTrigger value="members">{t("tabs.members")}</TabsTrigger> : null}
          <TabsTrigger value="blocklist">{t("tabs.blocklist")}</TabsTrigger>
          <TabsTrigger value="notifications">{t("tabs.notifications")}</TabsTrigger>
          <TabsTrigger value="connection">{t("tabs.connection")}</TabsTrigger>
          <TabsTrigger value="ai">{t("tabs.ai")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralSettingsSection general={settings.general} onUpdate={updateGeneral} />
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
            onReplyCountChange={(aiReplyCount) => updateGeneral({ aiReplyCount })}
          />
        </TabsContent>

        {AUTH_METHODS.password ? (
          <TabsContent value="profile">
            <ProfileSettingsSection />
          </TabsContent>
        ) : null}

        {FEATURE_FLAGS.inviteMembers ? (
          <TabsContent value="members">
            <MembersSettingsSection />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
