import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { BELL_RING_MS, useBellRing } from "../use-bell-ring";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

interface Props {
  count: number;
  ready?: boolean;
  suppressed?: boolean;
}

function renderRing(initial: Props) {
  return renderHook(
    ({ count, ready = true, suppressed = false }: Props) => useBellRing(count, { ready, suppressed }),
    { initialProps: initial },
  );
}

describe("useBellRing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not ring for the count the feed first loads with", () => {
    const { result } = renderRing({ count: 5 });

    expect(result.current.isRinging).toBe(false);
    expect(result.current.announcedCount).toBe(0);
  });

  // The count is 0 while loading and jumps to the real total on load, which is not news.
  test("treats the first count after loading as the baseline, not an increase", () => {
    const { result, rerender } = renderRing({ count: 0, ready: false });

    rerender({ count: 4, ready: true });

    expect(result.current.isRinging).toBe(false);
  });

  test("rings when the unread count goes up, then settles after the swing", () => {
    const { result, rerender } = renderRing({ count: 2 });

    rerender({ count: 3 });
    expect(result.current.isRinging).toBe(true);
    expect(result.current.announcedCount).toBe(1);

    act(() => {
      vi.advanceTimersByTime(BELL_RING_MS);
    });
    expect(result.current.isRinging).toBe(false);
  });

  test("clears the announcement a few seconds later", () => {
    const { result, rerender } = renderRing({ count: 0 });

    rerender({ count: 2 });
    expect(result.current.announcedCount).toBe(2);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current.announcedCount).toBe(0);
  });

  test("does not ring when the count goes down (marking read)", () => {
    const { result, rerender } = renderRing({ count: 4 });

    rerender({ count: 3 });

    expect(result.current.isRinging).toBe(false);
  });

  test("restarts the swing for a second notice that arrives mid-ring", () => {
    const { result, rerender } = renderRing({ count: 0 });

    rerender({ count: 1 });
    const firstKey = result.current.ringKey;
    rerender({ count: 2 });

    expect(result.current.ringKey).not.toBe(firstKey);
    expect(result.current.announcedCount).toBe(2);
  });

  // While the popover is open the person is looking at the list.
  test("stays quiet while suppressed, and does not ring later for what it skipped", () => {
    const { result, rerender } = renderRing({ count: 1 });

    rerender({ count: 2, suppressed: true });
    expect(result.current.isRinging).toBe(false);

    rerender({ count: 2, suppressed: false });
    expect(result.current.isRinging).toBe(false);
  });

  // Regression: the held notice rang when the tab was shown even if the person had since cleared everything or opened the list.
  test("does not ring for a held notice that was cleared while the tab was hidden", () => {
    const { result, rerender } = renderRing({ count: 0 });

    setVisibility("hidden");
    rerender({ count: 1 });
    rerender({ count: 0 });
    act(() => setVisibility("visible"));

    expect(result.current.isRinging).toBe(false);
  });

  test("does not ring for a held notice when the list is open as the tab is shown", () => {
    const { result, rerender } = renderRing({ count: 0 });

    setVisibility("hidden");
    rerender({ count: 1 });
    rerender({ count: 1, suppressed: true });
    act(() => setVisibility("visible"));

    expect(result.current.isRinging).toBe(false);
  });

  test("holds a notice that arrives in a hidden tab and rings when the tab is shown", () => {
    const { result, rerender } = renderRing({ count: 0 });

    setVisibility("hidden");
    rerender({ count: 1 });
    expect(result.current.isRinging).toBe(false);

    act(() => setVisibility("visible"));
    expect(result.current.isRinging).toBe(true);
    expect(result.current.announcedCount).toBe(1);
  });
});
