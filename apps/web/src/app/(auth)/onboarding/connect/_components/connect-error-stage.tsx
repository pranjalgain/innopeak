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
 * Differentiated by `error.recovery` (4 values), not `error.code` (11 values) — the same code maps
 * to a different recovery in different call sites (e.g. `loadLocationsFailed` is `reconnect` in one
 * branch and `retry` in another), so the code alone doesn't determine how severe this is. Ranked by
 * how much the owner loses: `restart` discards the flow's progress (destructive); `retry`/
 * `reconnect` both resolve with one action (warning); `continue` is a soft-fail that doesn't block
 * (success).
 */
const RECOVERY_STYLE: Record<ErrorRecovery, { icon: IconType; badge: string }> = {
  retry: { icon: LuTriangleAlert, badge: "bg-warning-soft text-warning" },
  reconnect: { icon: LuUnplug, badge: "bg-warning-soft text-warning" },
  restart: { icon: LuRotateCcw, badge: "bg-destructive-soft text-destructive" },
  continue: { icon: LuArrowRight, badge: "bg-success-soft text-success" },
};

/**
 * One error *layout* for every failure in the flow, but no longer one visual — the hook decides
 * *what* recovery is available (`retry` | `reconnect` | `restart` | `continue`), and this now
 * reflects that in the icon/color too, not just the button label. Keeps the whole recovery matrix
 * in one testable place instead of spread across four stage components.
 */
export function ConnectErrorStage({ error, onRetry }: ConnectErrorStageProps) {
  const t = useTranslations("onboardingConnect");
  const { icon: Icon, badge } = RECOVERY_STYLE[error.recovery];

  return (
    <div className="animate-in fade-in slide-in-from-right-2 flex flex-col items-center gap-4 text-center duration-300 ease-fluid">
      <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-full", badge)}>
        <Icon className="size-6" />
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
