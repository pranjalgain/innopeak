import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LuExpand, LuMessageSquareText, LuPencil, LuSparkles } from "react-icons/lu";

import { PromptToneSelect } from "@/app/(dashboard)/settings/prompts/_components/prompt-tone-select";
import { PromptVersionHistory } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-history";
import { PromptVersionPreviewDialog } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-preview-dialog";
import { PromptVersionStatsLine } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-stats-line";
import { getCurrentVersion } from "@/app/_libs/utils/prompt";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiPrompt, PromptTone, PromptVersion, PromptVersionStats } from "@/types/domain";

interface PromptListProps {
  prompts: AiPrompt[];
  onEdit: (id: string) => void;
  onToneChange: (id: string, tone: PromptTone) => void;
  getStats: (promptId: string, version?: number) => PromptVersionStats;
}

const DATE_FORMAT = { month: "short", day: "numeric", year: "numeric" } as const;

export function PromptList({ prompts, onEdit, onToneChange, getStats }: PromptListProps) {
  const t = useTranslations("promptManagement");
  const format = useFormatter();
  const [previewed, setPreviewed] = useState<{ promptId: string; version: PromptVersion } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      {prompts.map((prompt, index) => {
        const current = getCurrentVersion(prompt);

        return (
          <Card
            key={prompt.id}
            className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards duration-500 ease-fluid"
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <LuMessageSquareText className="size-3.5" />
                </span>
                {prompt.name}
              </CardTitle>
              <CardDescription>{prompt.description}</CardDescription>
              <CardAction className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewed({ promptId: prompt.id, version: current })}
                >
                  <LuExpand />
                  {t("preview")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onEdit(prompt.id)}>
                  <LuPencil />
                  {t("edit")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Badge variant="outline" className="border-transparent bg-accent text-primary">
                  {t("versionBadge", { version: current.version })}
                </Badge>
                <PromptToneSelect promptId={prompt.id} tone={prompt.tone} onToneChange={(next) => onToneChange(prompt.id, next)} />
              </div>

              {/* Styled like a chat message from the AI, not a code block — this is literally the
                  text a customer will read, so it should look like a reply, not debug output. The
                  `rounded-tl-sm` corner (paired with the avatar sitting right above it) is what
                  reads as "this bubble came from that sender," the same convention as a
                  messaging app. */}
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <LuSparkles className="size-3.5" />
                </span>
                <div className="max-h-32 min-w-0 flex-1 overflow-hidden rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                  {current.template}
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("updatedAt", { date: format.dateTime(new Date(current.updatedAt), DATE_FORMAT), author: current.updatedByName })}
              </p>
              <div className="mt-1">
                <PromptVersionStatsLine stats={getStats(prompt.id, current.version)} />
              </div>

              <PromptVersionHistory promptId={prompt.id} versions={prompt.versions} />
            </CardContent>
          </Card>
        );
      })}

      <PromptVersionPreviewDialog
        version={previewed?.version ?? null}
        stats={previewed ? getStats(previewed.promptId, previewed.version.version) : null}
        onClose={() => setPreviewed(null)}
      />
    </div>
  );
}
