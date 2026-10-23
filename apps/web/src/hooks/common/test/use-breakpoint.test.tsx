import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useBreakpoint } from "../use-breakpoint";

type Listener = () => void;

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

function mockMatchMedia() {
  const listeners = new Set<Listener>();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    addEventListener: (_: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
  }));
  return listeners;
}

afterEach(() => setViewport(1024));

// Read straight from the window on the first client render: a phone used to paint the desktop shell and remount after an effect.
describe("useBreakpoint", () => {
  test.each([
    [375, "mobile"],
    [768, "tablet"],
    [1023, "tablet"],
    [1280, "desktop"],
  ])("a %ipx window is %s from the first render", (width, expected) => {
    mockMatchMedia();
    setViewport(width);

    const { result } = renderHook(() => useBreakpoint());

    expect(result.current).toBe(expected);
  });

  test("follows a resize across a breakpoint", () => {
    const listeners = mockMatchMedia();
    setViewport(1280);
    const { result } = renderHook(() => useBreakpoint());

    setViewport(500);
    act(() => listeners.forEach((listener) => listener()));

    expect(result.current).toBe("mobile");
  });
});
