import { LuMinus, LuTrendingDown, LuTrendingUp } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";

interface TrendIndicatorProps {
  delta: number;
  label?: string;
  /** "neutral" for a magnitude with no comparable prior period, where green/red would assert a judgment the data doesn't support. */
  tone?: "auto" | "neutral";
  className?: string;
}

export function TrendIndicator({ delta, label, tone = "auto", className }: TrendIndicatorProps) {
  const isNeutral = tone === "neutral";
  const Icon = isNeutral ? LuMinus : delta > 0 ? LuTrendingUp : delta < 0 ? LuTrendingDown : LuMinus;
  const toneClassName = isNeutral
    ? "bg-muted text-muted-foreground"
    : delta > 0
      ? "bg-success-soft text-success"
      : delta < 0
        ? "bg-destructive-soft text-destructive"
        : "bg-muted text-muted-foreground";

  return (
    <span
      title={label}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        toneClassName,
        className,
      )}
    >
      <Icon className="size-3" />
      {delta > 0 ? "+" : ""}
      {delta}
    </span>
  );
}
