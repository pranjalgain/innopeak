import { useTranslations } from "next-intl";
import { LuMapPin } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import type { DiscoveredLocation } from "@/hooks/onboarding/use-onboarding-connect-flow";

interface ConfirmLocationStageProps {
  location: DiscoveredLocation;
  onContinue: () => void;
}

export function ConfirmLocationStage({ location, onContinue }: ConfirmLocationStageProps) {
  const t = useTranslations("onboardingConnect.confirmLocation");

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent">
        <LuMapPin className="size-6 text-primary" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-gradient text-lg font-semibold">{t("title")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex w-full items-center gap-3 rounded-md border-[1.5px] border-primary bg-accent p-3.5 text-left">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card">
          <LuMapPin className="size-4.5 text-primary" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">{location.name}</span>
          <span className="text-[13px] text-muted-foreground">{location.address}</span>
        </div>
      </div>

      <Button type="button" size="block" onClick={onContinue}>
        {t("button")}
      </Button>
    </div>
  );
}
