import { describe, expect, test } from "vitest";

import { isInitialLoad } from "../is-initial-load";

describe("isInitialLoad", () => {
  test("is true while the first request is in flight", () => {
    expect(isInitialLoad({ isLoading: true, errorUpdatedAt: 0 })).toBe(true);
  });

  test("is false once a request has already failed, even though a retry is loading again", () => {
    expect(isInitialLoad({ isLoading: true, errorUpdatedAt: 1_700_000_000_000 })).toBe(false);
  });

  test("is false when nothing is loading", () => {
    expect(isInitialLoad({ isLoading: false, errorUpdatedAt: 0 })).toBe(false);
  });
});
