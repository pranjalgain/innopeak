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
  /** Returns whether the save succeeded — a failure already shows its own toast, so this only
   *  toasts on success. */
  onReplyCountChange: (count: number) => Promise<boolean>;
}

const REPLY_COUNT_OPTIONS = [1, 2, 3];

export function AiSettingsSection({ aiReplyCount, onReplyCountChange }: AiSettingsSectionProps) {
  const t = useTranslations("settings.ai");
  const tToasts = useTranslations("settings.toasts");

  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards ease-fluid motion-reduce:animate-none duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuSparkles className="text-primary size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none flex flex-col gap-4 rounded-lg border border-border p-4 duration-300 sm:flex-row sm:items-center sm:justify-between">
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
              void onReplyCountChange(Number(value)).then((succeeded) => {
                if (succeeded) toast.success(tToasts("aiReplyCountUpdated"));
              });
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

        <div
          style={{ animationDelay: "60ms" }}
          className="animate-in fade-in slide-in-from-bottom-1 fill-mode-backwards ease-fluid motion-reduce:animate-none flex flex-col gap-4 rounded-lg border border-border p-4 duration-300 sm:flex-row sm:items-center sm:justify-between">
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
