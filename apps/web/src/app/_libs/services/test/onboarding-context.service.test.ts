import { beforeEach, describe, expect, it } from "vitest";

import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";

describe("OnboardingContextService plan choice", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("starts with no plan chosen", () => {
    OnboardingContextService.set({ from: "signup", via: "password" });

    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "password" });
  });

  it("remembers the choice alongside the wizard context", () => {
    OnboardingContextService.set({ from: "signup", via: "sso" });

    OnboardingContextService.setPlan("free");

    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso", plan: "free" });
  });

  it("forgets the choice without ending the wizard", () => {
    OnboardingContextService.set({ from: "signup", via: "sso", plan: "paid" });

    OnboardingContextService.clearPlan();

    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso" });
  });

  it("does nothing outside a signup wizard, rather than inventing one", () => {
    OnboardingContextService.setPlan("free");

    expect(OnboardingContextService.get()).toBeNull();
  });

  it("ignores a plan value it does not recognise", () => {
    window.sessionStorage.setItem(
      "innopeak:onboarding-context",
      JSON.stringify({ from: "signup", via: "sso", plan: "enterprise", planGated: true }),
    );

    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso" });
  });

  describe("a context written before plan gating shipped", () => {
    // Someone mid-wizard at deploy time, e.g. on their way back from the Google grant.
    const legacy = (value: object) =>
      window.sessionStorage.setItem("innopeak:onboarding-context", JSON.stringify(value));

    it("reads as having chosen Free, so it is not bounced back to the plan screen", () => {
      legacy({ from: "signup", via: "sso" });

      expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso", plan: "free" });
    });

    it("keeps a Paid choice if one was somehow recorded", () => {
      legacy({ from: "signup", via: "password", plan: "paid" });

      expect(OnboardingContextService.get()?.plan).toBe("paid");
    });

    it("is upgraded to a marked context on the next write, after which a missing plan gates again", () => {
      legacy({ from: "signup", via: "sso" });

      OnboardingContextService.clearPlan();

      expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso" });
    });
  });

  it("marks every context it writes, so a missing plan on a new one still means 'not chosen yet'", () => {
    OnboardingContextService.set({ from: "signup", via: "sso" });

    const raw = JSON.parse(window.sessionStorage.getItem("innopeak:onboarding-context") ?? "{}") as {
      planGated?: boolean;
    };
    expect(raw.planGated).toBe(true);
    expect(OnboardingContextService.get()?.plan).toBeUndefined();
  });
});
