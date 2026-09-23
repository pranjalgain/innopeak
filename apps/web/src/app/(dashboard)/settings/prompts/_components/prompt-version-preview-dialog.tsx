"use client";

import { useFormatter, useTranslations } from "next-intl";

import { PromptVersionStatsLine } from "@/app/(dashboard)/settings/prompts/_components/prompt-version-stats-line";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PromptVersion, PromptVersionStats } from "@/types/domain";

interface PromptVersionPreviewDialogProps {
  version: PromptVersion | null;
  stats: PromptVersionStats | null;
  onClose: () => void;
}

const DATE_FORMAT = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
} as const;

/**
 * Full, unclipped view of one historical version's template — the history list itself keeps each
 * entry's preview to a few lines (`max-h-24 overflow-hidden`) so the collapsed list stays scannable,
 * which means a long template gets cut off there with no way to read the rest. This is that way.
 */
export function PromptVersionPreviewDialog({ version, stats, onClose }: PromptVersionPreviewDialogProps) {
  const t = useTranslations("promptManagement.history");
  const format = useFormatter();

  return (
    <Dialog open={version !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {version && (
          <>
            <DialogHeader>
              <DialogTitle>{t("previewTitle", { version: version.version })}</DialogTitle>
              <DialogDescription>
                {t("entryLabel", {
                  version: version.version,
                  date: format.dateTime(new Date(version.updatedAt), DATE_FORMAT),
                  author: version.updatedByName,
                })}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-96 overflow-y-auto rounded-lg bg-muted px-3.5 py-3 text-sm whitespace-pre-wrap">
              {version.template}
            </div>

            {stats && <PromptVersionStatsLine stats={stats} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
