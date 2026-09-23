import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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

/** How many distinct phase phrases `onboardingConnect.backfilling` defines (`phase1`..`phaseN`). */
const PHASE_COUNT = 3;
const PHASE_INTERVAL_MS = 3000;

export function BackfillingStage({
  progress,
  reviewsFetched,
  totalToImport,
  isSlow = false,
}: BackfillingStageProps) {
  const t = useTranslations("onboardingConnect.backfilling");
  // Presentation-only cycling — purely to keep a ~10-30s wait feeling alive, so it lives here
  // rather than in the polling hook, and stops rotating (falling back to `takingLonger`) once the
  // import is genuinely running long, at which point cycling through cheerful phrases would read
  // as tone-deaf.
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (isSlow) return;
    const timer = setInterval(() => setPhase((current) => (current + 1) % PHASE_COUNT), PHASE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isSlow]);

  const statusText = isSlow ? t("takingLonger") : t(`phase${phase + 1}` as "phase1");

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuDownload className="size-6 text-primary" />
      </div>
      <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{statusText}</p>
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
