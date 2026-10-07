import { useTranslations } from "next-intl";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PromptTone } from "@/types/domain";

interface PromptToneSelectProps {
  promptId: string;
  tone: PromptTone;
  onToneChange: (tone: PromptTone) => void;
}

const TONE_VALUES: PromptTone[] = ["friendly", "professional", "formal", "playful", "empathetic"];

/** Per-owner tone dial layered on the current version; changing it does not create a new prompt version. */
export function PromptToneSelect({ promptId, tone, onToneChange }: PromptToneSelectProps) {
  const t = useTranslations("promptManagement.tone");
  const inputId = `prompt-tone-${promptId}`;

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={inputId} className="text-xs text-muted-foreground">
        {t("label")}
      </Label>
      <Select value={tone} onValueChange={(value) => onToneChange(value as PromptTone)}>
        <SelectTrigger id={inputId} size="sm" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TONE_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`options.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
