import { useEffect, useState } from "react";

import type { Breakpoint } from "@/hooks/common/breakpoint.types";

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

/**
 * Three-way breakpoint (mobile < 768px, tablet 768-1023px, desktop >= 1024px),
 * same `matchMedia` pattern as `use-mobile.ts`. `AppShell` uses this to swap
 * between a full sidebar, an icon-rail sidebar, and a bottom nav bar —
 * behavior the shadcn `Sidebar` component doesn't drive on its own, since its
 * collapse state is normally user-toggled, not viewport-driven.
 */
export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    const tabletQuery = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
    const desktopQuery = window.matchMedia(`(max-width: ${DESKTOP_BREAKPOINT - 1}px)`);

    const compute = () => {
      if (window.innerWidth < TABLET_BREAKPOINT) {
        setBreakpoint("mobile");
      } else if (window.innerWidth < DESKTOP_BREAKPOINT) {
        setBreakpoint("tablet");
      } else {
        setBreakpoint("desktop");
      }
    };

    tabletQuery.addEventListener("change", compute);
    desktopQuery.addEventListener("change", compute);
    compute();

    return () => {
      tabletQuery.removeEventListener("change", compute);
      desktopQuery.removeEventListener("change", compute);
    };
  }, []);

  return breakpoint;
}
