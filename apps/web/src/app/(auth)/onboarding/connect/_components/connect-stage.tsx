import { useTranslations } from "next-intl";
import { LuMapPin } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface ConnectStageProps {
  onConnect: () => void;
}

export function ConnectStage({ onConnect }: ConnectStageProps) {
  const t = useTranslations("onboardingConnect.connect");

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuMapPin className="size-7 text-primary" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("description")}</p>
      </div>
      <Button type="button" size="block" onClick={onConnect}>
        {t("button")}
      </Button>
    </div>
  );
}
