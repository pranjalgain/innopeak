import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { GeneralSettings } from "@/types/domain";

interface GeneralSettingsSectionProps {
  general: GeneralSettings;
  onUpdate: (patch: Partial<GeneralSettings>) => void;
}

export function GeneralSettingsSection({ general, onUpdate }: GeneralSettingsSectionProps) {
  const t = useTranslations("settings.general");
  const tToasts = useTranslations("settings.toasts");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2.5 border-b border-border pb-6">
          <div className="flex items-center justify-between">
            <Label>{t("escalationThreshold.label")}</Label>
            <span className="font-mono text-lg font-bold text-primary">{general.escalationRatingThreshold}</span>
          </div>
          <Slider
            min={1}
            max={5}
            step={1}
            value={[general.escalationRatingThreshold]}
            onValueChange={([value]) =>
              onUpdate({ escalationRatingThreshold: value as GeneralSettings["escalationRatingThreshold"] })
            }
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{t("escalationThreshold.min")}</span>
            <span>{t("escalationThreshold.max")}</span>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("escalationThreshold.helper")}</p>
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="text-[13px] font-medium">{t("autoPost.label")}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{t("autoPost.helper")}</p>
          </div>
          <Switch
            checked={general.autoPostApprovedReplies}
            onCheckedChange={(checked) => {
              onUpdate({ autoPostApprovedReplies: checked });
              toast.success(tToasts("autoPostToggled"));
            }}
          />
        </div>

        <div className="flex max-w-70 flex-col gap-1.5">
          <Label htmlFor="retention-months">{t("retention.label")}</Label>
          <div className="flex items-center gap-2.5">
            <Input
              id="retention-months"
              type="number"
              min={1}
              value={general.reviewDataRetentionMonths}
              onChange={(event) => onUpdate({ reviewDataRetentionMonths: Number(event.target.value) })}
              className="w-24"
            />
            <span className="text-[13px] text-muted-foreground">{t("retention.suffix")}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
