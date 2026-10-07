import "@testing-library/jest-dom";
import { vi } from "vitest";

global.fetch = vi.fn();

// jsdom has no ResizeObserver; the real `Tabs` component throws on mount without a stand-in.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof globalThis.ResizeObserver;
}
