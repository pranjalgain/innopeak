import { useTranslations } from "next-intl";
import * as React from "react";
import { LuPlus, LuX } from "react-icons/lu";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { GeneralSettings } from "@/types/domain";

interface GeneralSettingsSectionProps {
  general: GeneralSettings;
  onSave: (patch: Partial<GeneralSettings>) => Promise<boolean>;
}

function retentionTextFor(months: number | null): string {
  return months !== null ? String(months) : "";
}

/** `null` means valid — anything else is the error message to show and Save is refused. */
function validateRetentionMonths(text: string, t: (key: string) => string): string | null {
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed >= 1 ? null : t("retention.errors.min");
}

/**
 * Edits are staged in local `draft` state and only reach the backend when Save is clicked — Cancel
 * discards `draft` back to the last-saved `general` prop. Deliberately not wired through `onUpdate`
 * per keystroke/toggle the way this used to work: a save-per-field meant the escalation slider alone
 * fired a request per drag tick.
 */
export function GeneralSettingsSection({ general, onSave }: GeneralSettingsSectionProps) {
  const t = useTranslations("settings.general");
  const tToasts = useTranslations("settings.toasts");
  const [draft, setDraft] = React.useState(general);
  // The retention input's own text, decoupled from `draft.reviewDataRetentionMonths`: the field
  // must be freely clearable (to retype a new value) without the minimum-1 rule snapping it back
  // to the old number on every keystroke — that check only runs when Save is clicked.
  const [retentionText, setRetentionText] = React.useState(() =>
    retentionTextFor(general.reviewDataRetentionMonths),
  );
  const [retentionError, setRetentionError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const retentionPresent = draft.reviewDataRetentionMonths !== null;
  const retentionDirty = retentionPresent
    ? general.reviewDataRetentionMonths === null ||
      retentionText !== retentionTextFor(general.reviewDataRetentionMonths)
    : general.reviewDataRetentionMonths !== null;
  const isDirty =
    draft.escalationRatingThreshold !== general.escalationRatingThreshold ||
    draft.autoPostApprovedReplies !== general.autoPostApprovedReplies ||
    retentionDirty;

  const handleSave = async () => {
    let finalDraft = draft;
    if (retentionPresent) {
      const error = validateRetentionMonths(retentionText, t);
      if (error) {
        setRetentionError(error);
        return;
      }
      finalDraft = { ...draft, reviewDataRetentionMonths: Number(retentionText) };
      setDraft(finalDraft);
    }

    setIsSaving(true);
    const succeeded = await onSave(finalDraft);
    setIsSaving(false);
    if (succeeded) toast.success(tToasts("generalSaved"));
  };

  const handleCancel = () => {
    setDraft(general);
    setRetentionText(retentionTextFor(general.reviewDataRetentionMonths));
    setRetentionError(null);
  };

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
            <span className="font-mono text-lg font-bold text-primary">{draft.escalationRatingThreshold}</span>
          </div>
          <Slider
            min={1}
            max={5}
            step={1}
            value={[draft.escalationRatingThreshold]}
            onValueChange={([value]) =>
              setDraft((d) => ({
                ...d,
                escalationRatingThreshold: value as GeneralSettings["escalationRatingThreshold"],
              }))
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
            checked={draft.autoPostApprovedReplies}
            onCheckedChange={(checked) => setDraft((d) => ({ ...d, autoPostApprovedReplies: checked }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="retention-months">{t("retention.label")}</Label>
          {retentionPresent ? (
            <>
              <div className="flex items-center gap-2.5">
                <Input
                  id="retention-months"
                  type="number"
                  min={1}
                  value={retentionText}
                  onChange={(event) => {
                    setRetentionText(event.target.value);
                    setRetentionError(null);
                  }}
                  aria-invalid={retentionError !== null}
                  className="w-20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="text-[13px] text-muted-foreground">{t("retention.suffix")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("retention.remove")}
                  onClick={() => {
                    setDraft((d) => ({ ...d, reviewDataRetentionMonths: null }));
                    setRetentionText("");
                    setRetentionError(null);
                  }}
                  className="size-6 rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <LuX className="size-3.5" />
                </Button>
              </div>
              {retentionError ? <p className="text-[12.5px] text-destructive">{retentionError}</p> : null}
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-muted-foreground">{t("retention.notSet")}</p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDraft((d) => ({ ...d, reviewDataRetentionMonths: 1 }));
                    setRetentionText("1");
                  }}
                >
                  <LuPlus className="size-3.5" />
                  {t("retention.add")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {isDirty ? (
          <div className="flex justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSaving}>
              {t("cancel")}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? t("saving") : t("save")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
