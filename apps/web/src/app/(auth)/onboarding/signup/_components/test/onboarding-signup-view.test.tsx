import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../../../../messages/en.json";
import { OnboardingSignupView } from "../onboarding-signup-view";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  // The view reads `?error=` on mount to surface a failed Google round trip — see
  // useOAuthErrorToast. No param here, so the hook is a no-op in these tests.
  usePathname: () => "/onboarding/signup",
  useSearchParams: () => new URLSearchParams(),
}));

// A fresh QueryClient per render so one test's cached `["platform-settings"]` entry can never
// leak into the next.
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
    // SSO-only — matches the platform's own shipped default (see the platform_settings
    // migration), and is exactly what these tests exercise.
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

    // The SSO-only path (default platform settings) is a 2-step stepper — no OTP step.
    expect(screen.getByText("Create account")).toBeInTheDocument();
    expect(screen.getByText("Connect business profile")).toBeInTheDocument();
    expect(screen.queryByText("Verify email")).not.toBeInTheDocument();
  });

  /**
   * Step 3 is no longer rendered here — it is its own route. That is forced rather than stylistic:
   * connecting is a real Google OAuth grant, so the browser leaves the app and returns through the
   * backend's callback, and `/onboarding/signup` is in `proxy.ts`'s REDIRECT_IF_AUTHENTICATED_PATHS
   * — by step 3 the user is authenticated, so any full navigation back here bounces to /dashboard.
   */
  test("hands off to the connect route after continuing with Microsoft", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Continue with Microsoft" }));

    // `waitFor`, because signup itself is async — the handoff happens after it resolves.
    await waitFor(() => expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_CONNECT));
    // The stepper on the destination route needs to know this is still the signup wizard, and
    // which variant, because the backend callback redirects to a fixed path and drops query params.
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
});
