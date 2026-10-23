import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useCountUp } from "../use-count-up";

const original = window.matchMedia;
afterEach(() => {
  window.matchMedia = original;
});

describe("useCountUp", () => {
  // A visitor who asked for less motion gets the figure at once, not a 900 ms count.
  test("shows the target immediately under reduced motion", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;

    const { result } = renderHook(() => useCountUp(42, false));

    expect(result.current).toBe(42);
  });

  test("starts from zero otherwise", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;

    const { result } = renderHook(() => useCountUp(42, false));

    expect(result.current).toBeLessThan(42);
  });

  test("copes with no matchMedia at all", () => {
    window.matchMedia = undefined as never;

    expect(() => renderHook(() => useCountUp(42, false))).not.toThrow();
  });
});
