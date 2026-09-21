import { useTranslations } from "next-intl";
import { LuDownload } from "react-icons/lu";

import { Progress } from "@/components/ui/progress";

interface BackfillingStageProps {
  /** Null means the provider reported no total — render an indeterminate bar, not a fake number. */
  progress: number | null;
  reviewsFetched: number;
  totalToImport: number | null;
  /** Running unusually long. Not a failure — the import continues and the copy softens. */
  isSlow?: boolean;
}

export function BackfillingStage({
  progress,
  reviewsFetched,
  totalToImport,
  isSlow = false,
}: BackfillingStageProps) {
  const t = useTranslations("onboardingConnect.backfilling");

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuDownload className="size-6 text-primary" />
      </div>
      <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">
        {isSlow ? t("takingLonger") : t("description")}
      </p>
      <Progress value={progress ?? undefined} indeterminate={progress === null} />
      <span className="text-[13px] text-muted-foreground">
        {/* `reviewsFetched` is always real and always climbing, so "112 reviews imported" is
            available even when "112 of 187" is not. */}
        {totalToImport === null
          ? t("importingUnknownTotal", { imported: reviewsFetched })
          : t("importing", { imported: reviewsFetched, total: totalToImport })}
      </span>
    </div>
  );
}
