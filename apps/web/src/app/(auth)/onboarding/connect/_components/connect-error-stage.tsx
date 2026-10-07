import { useTranslations } from "next-intl";
import type { IconType } from "react-icons";
import { LuArrowRight, LuRotateCcw, LuTriangleAlert, LuUnplug } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";
import { Button } from "@/components/ui/button";
import type { ConnectFlowError, ErrorRecovery } from "@/hooks/onboarding/use-onboarding-connect-flow";

interface ConnectErrorStageProps {
  error: ConnectFlowError;
  onRetry: () => void;
}

/**
 * Keyed by `error.recovery`, not `error.code`: the same code maps to different recoveries in different call sites.
 * Ranked by what the owner loses: `restart` (destructive), `retry`/`reconnect` (warning), `continue` (success).
 */
const RECOVERY_STYLE: Record<ErrorRecovery, { icon: IconType; badge: string }> = {
  retry: { icon: LuTriangleAlert, badge: "bg-warning-soft text-warning" },
  reconnect: { icon: LuUnplug, badge: "bg-warning-soft text-warning" },
  restart: { icon: LuRotateCcw, badge: "bg-destructive-soft text-destructive" },
  continue: { icon: LuArrowRight, badge: "bg-success-soft text-success" },
};

/** One layout for every failure, with icon/color reflecting the recovery the hook decides; keeps the recovery matrix in one testable place. */
export function ConnectErrorStage({ error, onRetry }: ConnectErrorStageProps) {
  const t = useTranslations("onboardingConnect");
  const { icon: Icon, badge } = RECOVERY_STYLE[error.recovery];

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-full", badge)}>
        <Icon className="size-6" />
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {error.message ?? t(`errors.${error.code}` as "errors.UNKNOWN")}
      </p>
      <Button type="button" size="block" onClick={onRetry}>
        {t(`actions.${error.recovery}` as "actions.retry")}
      </Button>
    </div>
  );
}
