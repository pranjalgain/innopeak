import { useCallback, useEffect, useRef, useState } from "react";

/** How long the bell swings; matches the `bell-ring` keyframes in `globals.css`. */
export const BELL_RING_MS = 800;
/** How long the "N new notifications" announcement stays in the live region before it is cleared. */
const ANNOUNCE_MS = 5_000;

interface UseBellRingOptions {
  /** False until the feed has loaded: the first count is the baseline, not news. */
  ready: boolean;
  /** True while the popover is open: the person is looking at the list, so it needs no nudge. */
  suppressed: boolean;
}

interface UseBellRingResult {
  /** Changes on every ring, so using it as a React `key` restarts the animation for back-to-back notices. */
  ringKey: number;
  isRinging: boolean;
  /** Notices that arrived since the last announcement was cleared; 0 when there is nothing to announce. */
  announcedCount: number;
}

/**
 * Tells the bell to buzz when the unread count goes **up** while the page is open. Driven by the count, not by how it arrived, so it works
 * the same for polling and for a push stream later. No ring on the first load, when the count goes down (marking read), or while the popover
 * is open; a notice that arrives in a hidden tab is held and plays when the tab is shown.
 */
export function useBellRing(unreadCount: number, options: UseBellRingOptions): UseBellRingResult {
  const { ready, suppressed } = options;
  const [ringKey, setRingKey] = useState(0);
  const [isRinging, setIsRinging] = useState(false);
  const [announcedCount, setAnnouncedCount] = useState(0);

  const baselineRef = useRef<number | null>(null);
  const heldRef = useRef(0);
  // Latest values for `playHeld`, which runs from a DOM event and must not act on what was true when the notice was held.
  const suppressedRef = useRef(suppressed);
  const countRef = useRef(unreadCount);
  useEffect(() => {
    suppressedRef.current = suppressed;
    countRef.current = unreadCount;
  }, [suppressed, unreadCount]);
  const ringTimerRef = useRef<number | undefined>(undefined);
  const announceTimerRef = useRef<number | undefined>(undefined);

  const ring = useCallback((newNotices: number) => {
    setRingKey((key) => key + 1);
    setIsRinging(true);
    setAnnouncedCount((count) => count + newNotices);

    window.clearTimeout(ringTimerRef.current);
    ringTimerRef.current = window.setTimeout(() => setIsRinging(false), BELL_RING_MS);
    window.clearTimeout(announceTimerRef.current);
    announceTimerRef.current = window.setTimeout(() => setAnnouncedCount(0), ANNOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!ready) return;

    if (baselineRef.current === null) {
      baselineRef.current = unreadCount;
      return;
    }

    const increase = unreadCount - baselineRef.current;
    baselineRef.current = unreadCount;
    if (increase <= 0 || suppressed) return;

    if (document.visibilityState === "visible") ring(increase);
    else heldRef.current += increase;
  }, [unreadCount, ready, suppressed, ring]);

  useEffect(() => {
    const playHeld = () => {
      if (document.visibilityState !== "visible" || heldRef.current === 0) return;
      const held = heldRef.current;
      heldRef.current = 0;
      // The person may have opened the list, or cleared the notices elsewhere, while the tab was hidden: ring only for what is still unread
      // and unseen.
      const stillUnread = Math.min(held, countRef.current);
      if (suppressedRef.current || stillUnread <= 0) return;
      ring(stillUnread);
    };
    document.addEventListener("visibilitychange", playHeld);
    return () => document.removeEventListener("visibilitychange", playHeld);
  }, [ring]);

  useEffect(
    () => () => {
      window.clearTimeout(ringTimerRef.current);
      window.clearTimeout(announceTimerRef.current);
    },
    [],
  );

  return { ringKey, isRinging, announcedCount };
}
