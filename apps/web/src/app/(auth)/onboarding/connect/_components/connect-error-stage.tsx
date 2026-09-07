import { useTranslations } from "next-intl";
import { LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";
import type { ConnectFlowError } from "@/hooks/onboarding/use-onboarding-connect-flow";

interface ConnectErrorStageProps {
  error: ConnectFlowError;
  onRetry: () => void;
}

/**
 * One error surface for every failure in the flow. The hook decides *what* recovery is available
 * (`retry` | `reconnect` | `restart` | `continue`); this only renders it — which keeps the whole
 * recovery matrix in one testable place instead of spread across four stage components.
 */
export function ConnectErrorStage({ error, onRetry }: ConnectErrorStageProps) {
  const t = useTranslations("onboardingConnect");

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-warning-soft">
        <LuTriangleAlert className="size-6 text-warning" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t(`errors.${error.code}` as "errors.UNKNOWN")}
      </p>
      <Button type="button" size="block" onClick={onRetry}>
        {t(`actions.${error.recovery}` as "actions.retry")}
      </Button>
    </div>
  );
}
