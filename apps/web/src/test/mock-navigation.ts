import { useSyncExternalStore } from "react";

/**
 * A stateful stand-in for `next/navigation` in hook tests: `push`/`replace` really change `window.location`, so code that
 * reads the live URL and code that subscribes through `useSearchParams` stay in step, as they do in the app.
 *
 *   vi.mock("next/navigation", async () => (await import("@/test/mock-navigation")).navigationMock);
 */
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

let navigationDelayMs = 0;

/** Makes `push`/`replace` take effect after a delay, like the real router, where the URL lags the call. */
export function setNavigationDelay(ms: number): void {
  navigationDelayMs = ms;
}

function go(href: string, mode: "push" | "replace") {
  const apply = () => {
    window.history[mode === "push" ? "pushState" : "replaceState"](null, "", href);
    notify();
  };
  if (navigationDelayMs > 0) setTimeout(apply, navigationDelayMs);
  else apply();
}

/** Resets the address bar between tests. */
export function resetNavigation(href = "/"): void {
  navigationDelayMs = 0;
  window.history.replaceState(null, "", href);
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  // Back/Forward change the URL without going through push/replace.
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
};

export const navigationMock = {
  useRouter: () => ({
    push: (href: string) => go(href, "push"),
    replace: (href: string) => go(href, "replace"),
  }),
  usePathname: () => window.location.pathname,
  useSearchParams: () => {
    const search = useSyncExternalStore(
      subscribe,
      () => window.location.search,
      () => "",
    );
    return new URLSearchParams(search);
  },
};
