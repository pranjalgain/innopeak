import * as React from "react";

/**
 * Animates from 0 up to `target` once, the moment `isLoading` first flips
 * to `false` — not on every render, and not again if `target` changes
 * later. Ease-out via `requestAnimationFrame` so it reads as a quick
 * counter rather than a linear tick.
 */
export function useCountUp(target: number, isLoading: boolean, duration = 900): number {
  const [value, setValue] = React.useState(0);
  const hasAnimatedRef = React.useRef(false);

  React.useEffect(() => {
    if (isLoading || hasAnimatedRef.current) return;
    hasAnimatedRef.current = true;

    if (target <= 0) {
      setValue(target);
      return;
    }

    let frame: number;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isLoading, target, duration]);

  return value;
}
