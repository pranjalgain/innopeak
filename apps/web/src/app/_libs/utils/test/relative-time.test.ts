import { describe, expect, test } from "vitest";

import { formatRelativeTime } from "../relative-time";

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-03T12:00:00.000Z");

  test("formats minutes ago", () => {
    expect(formatRelativeTime("2026-09-03T11:45:00.000Z", "en-US", now)).toBe("15 minutes ago");
  });

  test("formats hours ago", () => {
    expect(formatRelativeTime("2026-09-03T09:00:00.000Z", "en-US", now)).toBe("3 hours ago");
  });

  test("formats days ago", () => {
    expect(formatRelativeTime("2026-09-01T12:00:00.000Z", "en-US", now)).toBe("2 days ago");
  });

  test("falls back to seconds for very recent timestamps", () => {
    expect(formatRelativeTime("2026-09-03T11:59:30.000Z", "en-US", now)).toBe("30 seconds ago");
  });

  // Regression: the formatter was pinned to "en-US", so German readers saw "3 hours ago".
  test("renders in the locale it is given, not a hardcoded English one", () => {
    expect(formatRelativeTime("2026-09-03T09:00:00.000Z", "de", now)).toBe("vor 3 Stunden");
    expect(formatRelativeTime("2026-09-01T12:00:00.000Z", "de", now)).toBe("vorgestern");
  });

  test("caches one formatter per locale without leaking between them", () => {
    // Interleaved locales: an incorrectly keyed cache would return the first locale's wording.
    const iso = "2026-09-03T11:45:00.000Z";
    expect(formatRelativeTime(iso, "en-US", now)).toBe("15 minutes ago");
    expect(formatRelativeTime(iso, "de", now)).toBe("vor 15 Minuten");
    expect(formatRelativeTime(iso, "en-US", now)).toBe("15 minutes ago");
  });
});
