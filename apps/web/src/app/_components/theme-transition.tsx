"use client";

import { useTheme } from "next-themes";
import { type CSSProperties, useEffect, useRef, useState } from "react";

/** How long the effect plays; the CSS keyframes in `globals.css` read the same value through `--theme-fx-duration`, so they cannot drift apart. */
export const THEME_EFFECT_MS = 2600;

type ThemeEffect = "storm" | "sunrise";

/**
 * A one-shot scene over the page when the theme changes: a thunderstorm with lightning going to dark, a sunrise going to light. It plays
 * only on a change (never on page load, and never on the first theme the provider reports), is purely decorative (`aria-hidden`, no
 * pointer events, so it never blocks a click) and is skipped for anyone who asks for reduced motion. Mounted once in the root layout, so
 * it works from every screen that has a theme toggle, and also reacts to a theme change made in another tab.
 */
export function ThemeTransition() {
  const { resolvedTheme } = useTheme();
  const previousTheme = useRef<string | undefined>(undefined);
  const [effect, setEffect] = useState<{ kind: ThemeEffect; id: number } | null>(null);

  useEffect(() => {
    if (resolvedTheme === undefined) return;

    const changed = previousTheme.current !== undefined && previousTheme.current !== resolvedTheme;
    previousTheme.current = resolvedTheme;
    if (!changed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // A new `id` remounts the scene, so switching again mid-effect restarts it instead of stacking a second one.
    setEffect({ kind: resolvedTheme === "dark" ? "storm" : "sunrise", id: Date.now() });
  }, [resolvedTheme]);

  useEffect(() => {
    if (effect === null) return;
    const timer = window.setTimeout(() => setEffect(null), THEME_EFFECT_MS + 100);
    return () => window.clearTimeout(timer);
  }, [effect]);

  if (effect === null) return null;

  return (
    <div
      key={effect.id}
      aria-hidden="true"
      data-theme-effect={effect.kind}
      className="theme-fx"
      style={{ "--theme-fx-duration": `${THEME_EFFECT_MS}ms` } as CSSProperties}>
      {effect.kind === "storm" ? <StormScene /> : <SunriseScene />}
    </div>
  );
}

function StormScene() {
  return (
    <>
      <div className="theme-fx-clouds" />
      <div className="theme-fx-rain" />
      <div className="theme-fx-flash" />
      <Bolt className="theme-fx-bolt theme-fx-bolt-a" />
      <Bolt className="theme-fx-bolt theme-fx-bolt-b" />
    </>
  );
}

function SunriseScene() {
  return (
    <>
      <div className="theme-fx-sky" />
      <div className="theme-fx-rays" />
      <div className="theme-fx-sun" />
    </>
  );
}

function Bolt({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 60 100" fill="none" preserveAspectRatio="xMidYMin meet">
      <polyline
        points="34,0 22,30 36,32 14,66 28,68 8,100"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
