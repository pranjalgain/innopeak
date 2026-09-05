import { useTranslations } from "next-intl";
import { LuCheck } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface DoneStageProps {
  totalImported: number;
  onGoToDashboard: () => void;
}

export function DoneStage({ totalImported, onGoToDashboard }: DoneStageProps) {
  const t = useTranslations("onboardingConnect.done");

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-success-soft">
        <LuCheck className="size-6 text-success" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("description", { count: totalImported })}
        </p>
      </div>
      <Button type="button" size="block" onClick={onGoToDashboard}>
        {t("button")}
      </Button>
    </div>
  );
}
