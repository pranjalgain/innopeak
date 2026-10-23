import { useSyncExternalStore } from "react";

import type { Breakpoint } from "@/hooks/common/breakpoint.types";

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

function subscribe(onChange: () => void): () => void {
  const tabletQuery = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
  const desktopQuery = window.matchMedia(`(max-width: ${DESKTOP_BREAKPOINT - 1}px)`);
  tabletQuery.addEventListener("change", onChange);
  desktopQuery.addEventListener("change", onChange);
  return () => {
    tabletQuery.removeEventListener("change", onChange);
    desktopQuery.removeEventListener("change", onChange);
  };
}

function getSnapshot(): Breakpoint {
  if (window.innerWidth < TABLET_BREAKPOINT) return "mobile";
  if (window.innerWidth < DESKTOP_BREAKPOINT) return "tablet";
  return "desktop";
}

/**
 * mobile < 768px, tablet 768-1023px, desktop >= 1024px; AppShell swaps sidebar/icon rail/bottom nav on it, which shadcn's user-toggled
 * Sidebar doesn't do. Read straight from the window on the client (the server has no width and renders "desktop"), so a phone's first
 * client render is already the mobile tree instead of painting the desktop one and remounting after an effect.
 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getSnapshot, () => "desktop");
}
