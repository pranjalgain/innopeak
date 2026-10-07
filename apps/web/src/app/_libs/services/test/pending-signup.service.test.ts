import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PendingSignupService } from "@/app/_libs/services/pending-signup.service";

describe("PendingSignupService", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the email that is awaiting verification", () => {
    PendingSignupService.set("owner@cafe.test");

    expect(PendingSignupService.get()).toBe("owner@cafe.test");
  });

  it("returns null once cleared", () => {
    PendingSignupService.set("owner@cafe.test");
    PendingSignupService.clear();

    expect(PendingSignupService.get()).toBeNull();
  });

  it("forgets a pending signup that is older than the code is worth resuming", () => {
    vi.useFakeTimers();
    PendingSignupService.set("owner@cafe.test");

    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(PendingSignupService.get()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it.each(["not-json", JSON.stringify({ email: 42, savedAt: Date.now() }), JSON.stringify({ email: "no-at-sign", savedAt: Date.now() })])(
    "ignores a tampered value %s",
    (raw) => {
      window.sessionStorage.setItem("innopeak:pending-signup", raw);

      expect(PendingSignupService.get()).toBeNull();
    },
  );
});
