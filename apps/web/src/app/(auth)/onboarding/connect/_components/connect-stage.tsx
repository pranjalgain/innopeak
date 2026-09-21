import { useTranslations } from "next-intl";
import { LuMapPin } from "react-icons/lu";

import { Button } from "@/components/ui/button";

interface ConnectStageProps {
  onConnect: () => void;
  /**
   * True while the browser is being sent to Google. Needed because this is a full-page navigation,
   * not a fetch — there is a real gap between the click and the page leaving (the access-token
   * refresh), and without feedback an impatient owner clicks again and starts a second OAuth flow
   * whose state invalidates the first.
   */
  isLoading?: boolean;
}

export function ConnectStage({ onConnect, isLoading = false }: ConnectStageProps) {
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
      <Button type="button" size="block" onClick={onConnect} disabled={isLoading}>
        {isLoading ? t("connecting") : t("button")}
      </Button>
    </div>
  );
}
