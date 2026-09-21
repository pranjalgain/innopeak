import { useEffect, useRef, useState } from "react";

/**
 * Animates up to `target` the moment `isLoading` first flips to `false`, easing out via
 * `requestAnimationFrame` so it reads as a quick counter rather than a linear tick.
 *
 * Animates from 0 only the *first* time. A later `target` change animates from whatever is
 * currently displayed — a refetch that brings "48 businesses" up to 51 counts 48 → 51, it does not
 * replay from zero. Previously a `hasAnimated` ref short-circuited the effect permanently, so
 * every value after the first was ignored outright: on a `refetchOnReconnect` the surrounding
 * panels updated and these tiles kept rendering the old numbers, contradicting the rest of the
 * page until a reload.
 */
export function useCountUp(target: number, isLoading: boolean, duration = 900): number {
  const [value, setValue] = useState(0);
  const hasAnimatedRef = useRef(false);
  // Read inside the animation effect below but deliberately NOT one of its dependencies:
  // depending on the displayed value there would restart the animation on every frame it sets.
  // Synced via its own effect rather than assigned during render — a ref is a side effect, and
  // React may render a function component more than once per commit (Strict Mode, an interrupted
  // render), so writing `valueRef.current` in the render body itself doesn't reliably keep it in
  // step with the `value` that actually committed.
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
