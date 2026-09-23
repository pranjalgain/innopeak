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

/** Two per page — pagination controls only earn their place on the screen once there's actually
 *  more than a couple of entries to page through. */
const VERSIONS_PER_PAGE = 2;

/**
 * Read-only list of every prior version, oldest first (excludes the current
 * one — that's already shown on the prompt card). No restore action here;
 * this is history, not rollback. Each entry shows that version's own
 * approval-rate stats, not just its template — the point of versioning is
 * seeing whether an edit actually helped.
 */
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

  // Only the couple of versions actually on screen right now — and not even those until this
  // section is expanded. Every prior version used to get fetched up front the moment the page
  // loaded, whether or not anyone ever opened its history.
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

      {/*
       * `grid-template-rows: 0fr -> 1fr` is a CSS-only fluid collapse — the row track's own size
       * is what's animated. That only works if there's a single grid item inside: `<ul>` and
       * `Pagination` used to be two SEPARATE children of this grid container with no explicit
       * `grid-row`, so CSS auto-placement put them in two different rows — the explicit one
       * (correctly sized 0fr/1fr) and an implicit second one, which defaults to `auto` and
       * therefore never collapses no matter what `isOpen` is. That's exactly why `Pagination` kept
       * showing below the "collapsed" list. Wrapping both in one inner `<div>` makes them a single
       * grid item, so the row's own 0fr/1fr sizing (plus `overflow-hidden` here to clip it) covers
       * everything inside, together.
       */}
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
                {/* Same "this is a message, not code" framing as the current version's bubble on
                    the card above, just a quieter/compact variant to match a de-emphasized history
                    entry — a plain background instead of an avatar-fronted bubble. */}
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
