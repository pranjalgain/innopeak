import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { THEME_EFFECT_MS, ThemeTransition } from "../theme-transition";

const theme = vi.hoisted(() => ({ resolved: undefined as string | undefined }));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: theme.resolved }) }));

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const scene = (container: HTMLElement) => container.querySelector("[data-theme-effect]");

describe("ThemeTransition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    theme.resolved = undefined;
    mockReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("plays nothing on page load, whichever theme the page opens in", () => {
    theme.resolved = "dark";
    const { container } = render(<ThemeTransition />);

    expect(scene(container)).toBeNull();
  });

  test("does not play while the provider has not reported a theme yet, nor when that first theme arrives", () => {
    const { container, rerender } = render(<ThemeTransition />);
    expect(scene(container)).toBeNull();

    theme.resolved = "light";
    rerender(<ThemeTransition />);

    expect(scene(container)).toBeNull();
  });

  test("plays a thunderstorm with lightning when the theme changes to dark", () => {
    theme.resolved = "light";
    const { container, rerender } = render(<ThemeTransition />);

    theme.resolved = "dark";
    rerender(<ThemeTransition />);

    expect(scene(container)).toHaveAttribute("data-theme-effect", "storm");
    expect(container.querySelector(".theme-fx-flash")).not.toBeNull();
    expect(container.querySelectorAll(".theme-fx-bolt")).toHaveLength(2);
  });

  test("plays a sunrise when the theme changes to light", () => {
    theme.resolved = "dark";
    const { container, rerender } = render(<ThemeTransition />);

    theme.resolved = "light";
    rerender(<ThemeTransition />);

    expect(scene(container)).toHaveAttribute("data-theme-effect", "sunrise");
    expect(container.querySelector(".theme-fx-sun")).not.toBeNull();
    expect(container.querySelector(".theme-fx-rays")).not.toBeNull();
  });

  test("is purely decorative: hidden from assistive tech and never blocks the page", () => {
    theme.resolved = "light";
    const { container, rerender } = render(<ThemeTransition />);
    theme.resolved = "dark";
    rerender(<ThemeTransition />);

    expect(scene(container)).toHaveAttribute("aria-hidden", "true");
    expect(scene(container)).toHaveClass("theme-fx");
  });

  test("removes itself once the effect is over", () => {
    theme.resolved = "light";
    const { container, rerender } = render(<ThemeTransition />);
    theme.resolved = "dark";
    rerender(<ThemeTransition />);
    expect(scene(container)).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(THEME_EFFECT_MS + 200);
    });

    expect(scene(container)).toBeNull();
  });

  test("switching again mid-effect swaps to the new scene instead of stacking a second", () => {
    theme.resolved = "light";
    const { container, rerender } = render(<ThemeTransition />);
    theme.resolved = "dark";
    rerender(<ThemeTransition />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    vi.setSystemTime(Date.now() + 1);

    theme.resolved = "light";
    rerender(<ThemeTransition />);

    expect(container.querySelectorAll("[data-theme-effect]")).toHaveLength(1);
    expect(scene(container)).toHaveAttribute("data-theme-effect", "sunrise");
  });

  test("plays nothing for someone who asks for reduced motion", () => {
    mockReducedMotion(true);
    theme.resolved = "light";
    const { container, rerender } = render(<ThemeTransition />);

    theme.resolved = "dark";
    rerender(<ThemeTransition />);

    expect(scene(container)).toBeNull();
  });
});
