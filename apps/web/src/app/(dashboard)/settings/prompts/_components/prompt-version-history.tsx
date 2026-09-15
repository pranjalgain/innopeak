"use client";


import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";


import { PromptVersionStatsLine } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-stats-line";
import { cn } from "@/app/_libs/utils/cn";
import { Pagination } from "@/components/common/pagination";
import { Button } from "@/components/ui/button";
import { usePagination } from "@/hooks/common/use-pagination";
import type { PromptVersion, PromptVersionStats } from "@/types/domain";

interface PromptVersionHistoryProps {
  promptId: string;
  versions: PromptVersion[];
  getStats: (promptId: string, version?: number) => PromptVersionStats;
}

const DATE_FORMAT = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

/**
 * Read-only list of every prior version, oldest first (excludes the current
 * one — that's already shown on the prompt card). No restore action here;
 * this is history, not rollback. Each entry shows that version's own
 * approval-rate stats, not just its template — the point of versioning is
 * seeing whether an edit actually helped.
 */
export function PromptVersionHistory({ promptId, versions, getStats }: PromptVersionHistoryProps) {
  const t = useTranslations("promptManagement.history");
  const format = useFormatter();
  const [isOpen, setIsOpen] = useState(false);
  const priorVersions = versions.slice(0, -1);
  const reversedPriorVersions = [...priorVersions].reverse();
  const { page, totalPages, pageItems, goToPreviousPage, goToNextPage } = usePagination(
    reversedPriorVersions,
    10,
  );

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

      {/*
       * `grid-template-rows: 0fr -> 1fr` is a CSS-only fluid collapse — the row track's
       * own size is what's animated, so `overflow-hidden` on the inner wrapper clips it
       * without ever having to measure the content's real height in JS.
       */}
      <div
        className={cn(
          "ease-fluid grid transition-[grid-template-rows,margin-top] duration-300",
          isOpen ? "mt-2 grid-rows-[1fr]" : "mt-0 grid-rows-[0fr]",
        )}>
        <ul className="flex flex-col gap-2 overflow-hidden">
          {pageItems.map((version) => (
            <li key={version.version} className="bg-muted rounded-md p-2.5">
              <p className="text-muted-foreground text-xs font-medium">
                {t("entryLabel", {
                  version: version.version,
                  date: format.dateTime(new Date(version.updatedAt), DATE_FORMAT),
                  author: version.updatedByName,
                })}
              </p>
              <pre className="text-muted-foreground mt-1.5 max-h-24 overflow-hidden font-mono text-xs whitespace-pre-wrap">
                {version.template}
              </pre>
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
  );
}
