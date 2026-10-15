import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";
import type { PlatformSettings } from "@/types/domain";

import { isPlanStepSkipped, useHandOffAfterSignup, useOnboardingSteps } from "../use-onboarding-steps";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace }) }));

const settings = vi.hoisted(() => ({ current: undefined as { paymentFeatureEnabled?: boolean } | undefined }));
vi.mock("@/hooks/common/use-platform-settings", () => ({
  usePlatformSettings: () => ({ data: settings.current }),
}));

describe("isPlanStepSkipped", () => {
  const base = {
    microsoftLoginEnabled: true,
    passwordLoginEnabled: true,
    googleLoginEnabled: true,
    inviteMembersEnabled: true,
    notificationSettingsEnabled: false,
  } satisfies PlatformSettings;

  test("is skipped when the payment feature is off or not reported", () => {
    expect(isPlanStepSkipped({ ...base, paymentFeatureEnabled: false })).toBe(true);
    expect(isPlanStepSkipped(base)).toBe(true);
  });

  test("is not skipped when the payment feature is on", () => {
    expect(isPlanStepSkipped({ ...base, paymentFeatureEnabled: true })).toBe(false);
  });

  // The settings are public and cached, but until they arrive a deploy with payments on must not lose the step.
  test("is not skipped while the settings are still unknown", () => {
    expect(isPlanStepSkipped(undefined)).toBe(false);
  });
});

describe("useOnboardingSteps", () => {
  test("includes the plan step when payments are on", () => {
    settings.current = { paymentFeatureEnabled: true };

    expect(renderHook(() => useOnboardingSteps(false)).result.current).toEqual(["identity", "plan", "connect"]);
    expect(renderHook(() => useOnboardingSteps(true)).result.current).toEqual(["identity", "otp", "plan", "connect"]);
  });

  test("leaves the plan step out when payments are off", () => {
    settings.current = { paymentFeatureEnabled: false };

    expect(renderHook(() => useOnboardingSteps(false)).result.current).toEqual(["identity", "connect"]);
    expect(renderHook(() => useOnboardingSteps(true)).result.current).toEqual(["identity", "otp", "connect"]);
  });

  test("keeps the plan step while the settings load", () => {
    settings.current = undefined;

    expect(renderHook(() => useOnboardingSteps(false)).result.current).toEqual(["identity", "plan", "connect"]);
  });
});

describe("useHandOffAfterSignup", () => {
  beforeEach(() => {
    replace.mockClear();
    window.sessionStorage.clear();
  });

  test("goes to the plan step when payments are on, recording no plan yet", () => {
    settings.current = { paymentFeatureEnabled: true };

    renderHook(() => useHandOffAfterSignup()).result.current("password");

    expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_PLAN);
    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "password" });
  });

  // Nothing to choose: Free is recorded so the connect screen's gate opens, and the plan page is never visited.
  test("goes straight to connect as Free when payments are off", () => {
    settings.current = { paymentFeatureEnabled: false };

    renderHook(() => useHandOffAfterSignup()).result.current("sso");

    expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_CONNECT);
    expect(replace).not.toHaveBeenCalledWith(ROUTES.ONBOARDING_PLAN);
    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso", plan: "free" });
  });

  test("keeps the plan step while the settings are still unknown", () => {
    settings.current = undefined;

    renderHook(() => useHandOffAfterSignup()).result.current("sso");

    expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_PLAN);
  });
});
