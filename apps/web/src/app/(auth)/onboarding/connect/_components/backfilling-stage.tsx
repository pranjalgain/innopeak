import { useTranslations } from "next-intl";
import { LuDownload } from "react-icons/lu";

import { Progress } from "@/components/ui/progress";

interface BackfillingStageProps {
  progress: number;
  importedCount: number;
  totalToImport: number;
}

export function BackfillingStage({ progress, importedCount, totalToImport }: BackfillingStageProps) {
  const t = useTranslations("onboardingConnect.backfilling");

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuDownload className="size-6 text-primary" />
      </div>
      <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Progress value={progress} />
      <span className="text-[13px] text-muted-foreground">
        {t("importing", { imported: importedCount, total: totalToImport })}
      </span>
    </div>
  );
}
