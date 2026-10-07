"use client";


import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { LuChevronDown, LuChevronUp, LuExpand } from "react-icons/lu";


import { PromptVersionPreviewDialog } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-preview-dialog";
import { PromptVersionStatsLine } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-stats-line";
import { cn } from "@/app/_libs/utils/cn";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { usePagination } from "@/hooks/common/use-pagination";
import { usePromptVersionStatsQueries } from "@/hooks/prompts/use-prompt-analytics";
import type { PromptVersion } from "@/types/domain";

interface PromptVersionHistoryProps {
  promptId: string;
  versions: PromptVersion[];
}

const DATE_FORMAT = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

/** Pagination controls only earn their place once there are more than a couple of entries. */
const VERSIONS_PER_PAGE = 2;

/** Read-only history of prior versions, oldest first (the current one is on the prompt card); no restore. Shows per-version approval stats so an edit's effect is visible. */
export function PromptVersionHistory({ promptId, versions }: PromptVersionHistoryProps) {
  const t = useTranslations("promptManagement.history");
  const format = useFormatter();
  const [isOpen, setIsOpen] = useState(false);
  const [previewedVersion, setPreviewedVersion] = useState<PromptVersion | null>(null);
  const priorVersions = versions.slice(0, -1);
  const reversedPriorVersions = [...priorVersions].reverse();
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(
    reversedPriorVersions,
    VERSIONS_PER_PAGE,
  );

  // Only the versions on screen, and none until the section is expanded.
  const pairs = useMemo(
    () => pageItems.map((version) => ({ promptId, version: version.version })),
    [pageItems, promptId],
  );
  const { getStats } = usePromptVersionStatsQueries(pairs, isOpen);

  if (priorVersions.length === 0) return null;

  return (
    <div className="border-border mt-2 border-t pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="text-muted-foreground hover:text-foreground h-auto gap-1 px-0 text-xs font-medium hover:bg-transparent">
        {isOpen ? <LuChevronUp className="size-3.5" /> : <LuChevronDown className="size-3.5" />}
        {t("toggle", { count: priorVersions.length })}
      </Button>

      {/* `grid-template-rows: 0fr -> 1fr` only collapses a single grid item: `<ul>` and `Pagination` as separate children landed in an implicit `auto` row that never collapses, so both go in one inner `<div>`. */}
      <div
        className={cn(
          "ease-fluid grid transition-[grid-template-rows,margin-top] duration-300",
          isOpen ? "mt-2 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr]",
        )}>
        <div className="overflow-hidden">
          <ul className="flex flex-col gap-2">
            {pageItems.map((version) => (
              <li key={version.version} className="bg-muted rounded-md p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-muted-foreground text-xs font-medium">
                    {t("entryLabel", {
                      version: version.version,
                      date: format.dateTime(new Date(version.updatedAt), DATE_FORMAT),
                      author: version.updatedByName,
                    })}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreviewedVersion(version)}
                    className="text-muted-foreground hover:text-foreground h-auto shrink-0 gap-1 px-1.5 py-0.5 text-[11px] hover:bg-transparent"
                  >
                    <LuExpand className="size-3" />
                    {t("preview")}
                  </Button>
                </div>
                {/* Quieter variant of the current version's message bubble. */}
                <div className="text-muted-foreground mt-1.5 max-h-24 overflow-hidden rounded-lg bg-background px-2.5 py-2 text-xs whitespace-pre-wrap">
                  {version.template}
                </div>
                <div className="mt-1.5">
                  <PromptVersionStatsLine stats={getStats(promptId, version.version)} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrevious={goToPreviousPage}
              onNext={goToNextPage}
            />
          </div>
        </div>
      </div>

      <PromptVersionPreviewDialog
        version={previewedVersion}
        stats={previewedVersion ? getStats(promptId, previewedVersion.version) : null}
        onClose={() => setPreviewedVersion(null)}
      />
    </div>
  );
}
