import { describe, expect, test } from "vitest";

import { formatRelativeTime } from "./relative-time";

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");

  test("formats minutes ago", () => {
    expect(formatRelativeTime("2026-09-03T11:45:00.000Z", now)).toBe("15 minutes ago");
  });

  test("formats hours ago", () => {
    expect(formatRelativeTime("2026-09-03T09:00:00.000Z", now)).toBe("3 hours ago");
  });

  test("formats days ago", () => {
    expect(formatRelativeTime("2026-09-01T12:00:00.000Z", now)).toBe("2 days ago");
  });

  test("falls back to seconds for very recent timestamps", () => {
    expect(formatRelativeTime("2026-09-03T11:59:30.000Z", now)).toBe("30 seconds ago");
  });
});
