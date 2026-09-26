import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock fetch globally for all tests
global.fetch = vi.fn();

// jsdom has no ResizeObserver — any test that mounts the real `Tabs` component (its sliding
// active-tab indicator measures itself via `@radix-ui/react-use-size`) throws
// `ReferenceError: ResizeObserver is not defined` on mount without this. A no-op stand-in is
// enough: nothing in a jsdom test actually resizes.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}
