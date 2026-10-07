import { useTranslations } from "next-intl";
import { LuToggleLeft } from "react-icons/lu";

import { LoadErrorState } from "@/components/common/load-error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useUpdatePlatformSettings } from "@/hooks/admin/use-update-platform-settings";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";
import type { PlatformSettings } from "@/types/domain";

interface PlatformToggleRowProps {
  label: string;
  helper: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Manual stagger: the four rows are written out rather than mapped; 60ms matches the page's other staggers. */
  delayMs: number;
}

function PlatformToggleRow({
  label,
  helper,
  checked,
  disabled,
  onCheckedChange,
  delayMs,
}: PlatformToggleRowProps) {
  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="border-border animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none flex items-center justify-between gap-4 border-b py-4 duration-300 last:border-b-0">
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        <p className="text-muted-foreground mt-0.5 text-[13px]">{helper}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function PlatformSection() {
  const t = useTranslations("adminSettings.platform");
  const { data: settings, isLoading, isError, refetch } = usePlatformSettings();
  const { update, isUpdating } = useUpdatePlatformSettings();

  if (isLoading) return <Skeleton className="h-72 w-full max-w-3xl rounded-xl" />;
  // An infinite skeleton is not a loading state (see ProfileSection).
  if (isError || !settings) return <LoadErrorState onRetry={() => void refetch()} />;

  const toggle = (field: keyof PlatformSettings) => (checked: boolean) => {
    void update({ [field]: checked });
  };

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuToggleLeft className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <PlatformToggleRow
          label={t("sso.label")}
          helper={t("sso.helper")}
          checked={settings.ssoLoginEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("ssoLoginEnabled")}
          delayMs={0}
        />
        <PlatformToggleRow
          label={t("password.label")}
          helper={t("password.helper")}
          checked={settings.passwordLoginEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("passwordLoginEnabled")}
          delayMs={60}
        />
        <PlatformToggleRow
          label={t("social.label")}
          helper={t("social.helper")}
          checked={settings.socialLoginEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("socialLoginEnabled")}
          delayMs={120}
        />
        <PlatformToggleRow
          label={t("inviteMembers.label")}
          helper={t("inviteMembers.helper")}
          checked={settings.inviteMembersEnabled}
          disabled={isUpdating}
          onCheckedChange={toggle("inviteMembersEnabled")}
          delayMs={180}
        />
      </CardContent>
    </Card>
  );
}
