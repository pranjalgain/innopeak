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

  // The regression this guards: the formatter used to be a module-level constant pinned to
  // "en-US", so a German reader saw "3 hours ago" in an otherwise fully German UI. The locale
  // is a required argument now precisely so it can't silently fall back to English again.
  test("renders in the locale it is given, not a hardcoded English one", () => {
    expect(formatRelativeTime("2026-09-03T09:00:00.000Z", "de", now)).toBe("vor 3 Stunden");
    expect(formatRelativeTime("2026-09-01T12:00:00.000Z", "de", now)).toBe("vorgestern");
  });

  test("caches one formatter per locale without leaking between them", () => {
    // Same input, different locales, interleaved — a shared/incorrectly-keyed cache would
    // return the first locale's wording for the second call.
    const iso = "2026-09-03T11:45:00.000Z";
    expect(formatRelativeTime(iso, "en-US", now)).toBe("15 minutes ago");
    expect(formatRelativeTime(iso, "de", now)).toBe("vor 15 Minuten");
    expect(formatRelativeTime(iso, "en-US", now)).toBe("15 minutes ago");
  });
});
