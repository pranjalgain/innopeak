import { useEffect, useState } from "react";

import type { Breakpoint } from "@/hooks/common/breakpoint.types";

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

/** mobile < 768px, tablet 768-1023px, desktop >= 1024px; AppShell swaps sidebar/icon rail/bottom nav on it, which shadcn's user-toggled Sidebar doesn't do. */
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
