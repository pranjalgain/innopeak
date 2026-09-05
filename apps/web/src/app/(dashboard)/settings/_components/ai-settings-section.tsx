import Link from "next/link";
import { useTranslations } from "next-intl";
import { LuArrowRight, LuMessagesSquare, LuSparkles } from "react-icons/lu";
import { toast } from "sonner";

import { ROUTES } from "@/app/_libs/constants/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { GeneralSettings } from "@/types/domain";

interface AiSettingsSectionProps {
  aiReplyCount: GeneralSettings["aiReplyCount"];
  onReplyCountChange: (count: number) => void;
}

const REPLY_COUNT_OPTIONS = [1, 2, 3];

export function AiSettingsSection({ aiReplyCount, onReplyCountChange }: AiSettingsSectionProps) {
  const t = useTranslations("settings.ai");
  const tToasts = useTranslations("settings.toasts");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <LuMessagesSquare className="size-4" />
            </div>
            <div>
              <Label htmlFor="ai-reply-count" className="text-[13px] font-medium">
                {t("replyCount.label")}
              </Label>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{t("replyCount.helper")}</p>
            </div>
          </div>
          <Select
            value={String(aiReplyCount)}
            onValueChange={(value) => {
              onReplyCountChange(Number(value));
              toast.success(tToasts("aiReplyCountUpdated"));
            }}
          >
            <SelectTrigger id="ai-reply-count" className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPLY_COUNT_OPTIONS.map((count) => (
                <SelectItem key={count} value={String(count)}>
                  {t("replyCount.option", { count })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <LuSparkles className="size-4" />
            </div>
            <div>
              <p className="text-[13px] font-medium">{t("prompts.label")}</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{t("prompts.helper")}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
            <Link href={ROUTES.SETTINGS_PROMPTS}>
              {t("prompts.manageButton")}
              <LuArrowRight />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
