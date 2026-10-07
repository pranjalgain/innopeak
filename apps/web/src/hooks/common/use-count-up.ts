import { useEffect, useRef, useState } from "react";

/** Eases up to `target` once `isLoading` flips false. Animates from 0 only the first time; later changes animate from the displayed value (48 -> 51, not a replay). */
export function useCountUp(target: number, isLoading: boolean, duration = 900): number {
  const [value, setValue] = useState(0);
  const hasAnimatedRef = useRef(false);
  // Read in the animation effect but not a dependency (it would restart the animation every frame). Synced in its own
  // effect because writing a ref during render isn't reliable under Strict Mode or interrupted renders.
  const valueRef = useRef(0);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (isLoading) return;

    const from = hasAnimatedRef.current ? valueRef.current : 0;
    hasAnimatedRef.current = true;

    if (target === from) return;

    if (target <= 0) {
      setValue(target);
      return;
    }

    let frame: number;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + eased * (target - from)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isLoading, target, duration]);

  return value;
}
