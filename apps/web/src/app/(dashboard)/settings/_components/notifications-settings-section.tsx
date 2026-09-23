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
              className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none flex items-center gap-4 border-b border-border py-3.5 last:border-b-0">
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
                  <ToggleGroupItem
                    key={channel}
                    value={channel}
                    // The base `Toggle`/`ToggleGroupItem` primitive's `hover:bg-accent`/
                    // `data-[state=on]:bg-accent` reads fine in light mode, but dark mode's
                    // `--accent` sits too close in lightness to `--card`/`--background` to read as
                    // a visible hover/selected state. A plain white overlay for hover (tried first)
                    // was too faint on a near-black background to register as "there's an effect
                    // here" at all, and read as barely different from resting. Using a translucent
                    // `primary` tint for hover instead — same hue family as the solid `primary` fill
                    // used for the selected state, just much lower intensity — reads as "a preview
                    // of what selecting this would look like" rather than an unrelated color, so
                    // hover and selected stay visually connected but clearly different in strength.
                    className="px-3 text-xs dark:data-[state=off]:hover:bg-primary/25 dark:data-[state=off]:hover:text-foreground dark:data-[state=on]:bg-primary dark:data-[state=on]:text-primary-foreground"
                  >
                    {t(`channels.${channel}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <Switch
                checked={recipient.isActive}
                onCheckedChange={() => onToggleActive(recipient.id)}
                className="hover:ring-[3px] hover:ring-ring/30 dark:hover:ring-ring/50"
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
