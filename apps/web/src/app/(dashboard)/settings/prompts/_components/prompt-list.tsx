import { useTranslations } from "next-intl";
import { LuPencil } from "react-icons/lu";

import { PromptToneSelect } from "@/app/(dashboard)/settings/prompts/_components/prompt-tone-select";
import { PromptVersionHistory } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-history";
import { PromptVersionStatsLine } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-stats-line";
import { getCurrentVersion } from "@/app/_libs/utils/prompt";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiPrompt, PromptTone, PromptVersionStats } from "@/types/domain";

interface PromptListProps {
  prompts: AiPrompt[];
  onEdit: (id: string) => void;
  onToneChange: (id: string, tone: PromptTone) => void;
  getStats: (promptId: string, version?: number) => PromptVersionStats;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export function PromptList({ prompts, onEdit, onToneChange, getStats }: PromptListProps) {
  const t = useTranslations("promptManagement");

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
              <CardTitle>{prompt.name}</CardTitle>
              <CardDescription>{prompt.description}</CardDescription>
              <CardAction>
                <Button type="button" variant="outline" size="sm" onClick={() => onEdit(prompt.id)}>
                  <LuPencil />
                  {t("edit")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  {t("versionBadge", { version: current.version })}
                </span>
                <PromptToneSelect promptId={prompt.id} tone={prompt.tone} onToneChange={(next) => onToneChange(prompt.id, next)} />
              </div>

              <pre className="max-h-32 overflow-hidden rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
                {current.template}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("updatedAt", { date: DATE_FORMATTER.format(new Date(current.updatedAt)), author: current.updatedByName })}
              </p>
              <div className="mt-1">
                <PromptVersionStatsLine stats={getStats(prompt.id, current.version)} />
              </div>

              <PromptVersionHistory promptId={prompt.id} versions={prompt.versions} getStats={getStats} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
