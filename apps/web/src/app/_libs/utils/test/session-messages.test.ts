import { afterEach, describe, expect, test } from "vitest";

import { sessionMessage } from "../session-messages";

afterEach(() => {
  document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
});

// These errors are raised below React (the axios interceptor), where an English sentence used to reach German users.
describe("sessionMessage", () => {
  test("is English by default", () => {
    expect(sessionMessage("refreshFailed")).toBe("Could not refresh your session. Please try again.");
  });

  test("follows the locale cookie", () => {
    document.cookie = "NEXT_LOCALE=de; path=/";

    expect(sessionMessage("expired")).toContain("abgelaufen");
    expect(sessionMessage("refreshFailed")).toContain("erneuert");
  });

  test("ignores a cookie it does not support", () => {
    document.cookie = "NEXT_LOCALE=fr; path=/";

    expect(sessionMessage("expired")).toBe("Your session has expired. Please sign in again.");
  });
});
