import { useTranslations } from "next-intl";
import { LuBell } from "react-icons/lu";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { NotificationChannel, NotificationRecipient } from "@/types/domain";

interface NotificationsSettingsSectionProps {
  recipients: NotificationRecipient[];
  onChannelChange: (id: string, channel: NotificationChannel) => void;
  onToggleActive: (id: string) => void;
}

const CHANNELS: NotificationChannel[] = ["email", "teams", "both"];

export function NotificationsSettingsSection({
  recipients,
  onChannelChange,
  onToggleActive,
}: NotificationsSettingsSectionProps) {
  const t = useTranslations("settings.notifications");

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuBell className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          recipients.map((recipient, index) => (
            <div
              key={recipient.id}
              style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none hover:bg-accent/40 flex items-center gap-4 rounded-md border-b border-border px-2 -mx-2 py-3.5 transition-colors duration-300 last:border-b-0">
              <Avatar className="size-8 shrink-0">
                <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
                  {recipient.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-sm font-medium">{recipient.name}</div>

              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={recipient.channel}
                onValueChange={(value) => {
                  if (value) onChannelChange(recipient.id, value as NotificationChannel);
                }}
              >
                {CHANNELS.map((channel) => (
                  <ToggleGroupItem key={channel} value={channel} className="px-3 text-xs">
                    {t(`channels.${channel}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <Switch checked={recipient.isActive} onCheckedChange={() => onToggleActive(recipient.id)} />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
