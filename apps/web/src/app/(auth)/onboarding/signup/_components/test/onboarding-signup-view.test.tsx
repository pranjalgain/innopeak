import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";
import { PendingSignupService } from "@/app/_libs/services/pending-signup.service";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../../../../messages/en.json";
import { OnboardingSignupView } from "../onboarding-signup-view";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  // The view reads `?error=` on mount (useOAuthErrorToast); no param here, so the hook is a no-op.
  usePathname: () => "/onboarding/signup",
  useSearchParams: () => new URLSearchParams(),
}));

// A fresh QueryClient per render so a cached `["platform-settings"]` entry can't leak between tests.
function renderView() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingSignupView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("OnboardingSignupView", () => {
  beforeEach(() => {
    replace.mockClear();
    window.sessionStorage.clear();
    // SSO-only, the platform's shipped default (see the platform_settings migration).
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: true,
      passwordLoginEnabled: false,
      socialLoginEnabled: false,
      inviteMembersEnabled: false,
    });
  });

  test("starts on the identity step with SSO only (default platform settings), no password/company-name fields", async () => {
    renderView();

    expect(
      await screen.findByRole("button", { name: "Continue with Microsoft" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Company name")).not.toBeInTheDocument();

    // The SSO-only path (default platform settings) is a 3-step stepper — no OTP step.
    expect(screen.getByText("Create account")).toBeInTheDocument();
    expect(screen.getByText("Choose your plan")).toBeInTheDocument();
    expect(screen.getByText("Connect business profile")).toBeInTheDocument();
    expect(screen.queryByText("Verify email")).not.toBeInTheDocument();
  });

  /** Step 3 is its own route: connecting is a Google OAuth grant that leaves the app, and `/onboarding/signup` bounces authenticated users to /dashboard. */
  test("hands off to the plan route after continuing with Microsoft", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Continue with Microsoft" }));

    // `waitFor`, because signup itself is async — the handoff happens after it resolves.
    await waitFor(() => expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_PLAN));
    // The destination stepper needs the wizard variant; the backend callback redirects to a fixed path and drops query params.
    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso" });
  });

  test("does not render the connect step in place", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Continue with Microsoft" }));
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(
      screen.queryByRole("button", { name: "Connect Google Business Profile" }),
    ).not.toBeInTheDocument();
  });

  /** Regression: refreshing on the OTP step dropped the user onto a blank signup form whose re-submit was refused (account exists). */
  test("resumes the verification step after a refresh instead of a blank signup form", async () => {
    PendingSignupService.set("owner@cafe.test");

    renderView();

    expect(await screen.findByText(/owner@cafe\.test/)).toBeTruthy();
    expect(screen.getByRole("button", { name: messages.onboardingSignup.otp.verifyButton })).toBeTruthy();
  });

  test("offers a way back to the form that forgets the pending email", async () => {
    PendingSignupService.set("owner@cafe.test");
    const user = userEvent.setup();

    renderView();
    await user.click(await screen.findByRole("button", { name: messages.onboardingSignup.otp.changeEmail }));

    expect(PendingSignupService.get()).toBeNull();
    expect(screen.queryByText(/owner@cafe\.test/)).toBeNull();
  });
});
