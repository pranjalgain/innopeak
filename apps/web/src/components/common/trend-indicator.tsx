import { LuMinus, LuTrendingDown, LuTrendingUp } from "react-icons/lu";

import { cn } from "@/app/_libs/utils/cn";

interface TrendIndicatorProps {
  /** Signed change vs. the previous period. */
  delta: number;
  /** Accessible/tooltip label for what the delta is measured against, e.g. "vs last month". */
  label?: string;
  /**
   * "auto" (default) colors and picks an icon by the sign of `delta` — up/success, down/destructive,
   * flat/muted. "neutral" always renders the flat/muted treatment regardless of sign, for a value
   * that is a magnitude rather than a true two-period comparison — one that can be positive without
   * that meaning "improving" (there's no comparable prior-period figure to call this "up" against),
   * so coloring it green/red would assert a judgment the data doesn't support.
   */
  tone?: "auto" | "neutral";
  className?: string;
}

/** A small pill reporting a signed change — up (success), down (destructive), or flat (muted). */
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
