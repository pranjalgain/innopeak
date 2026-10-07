import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { BillingService } from "@/app/_libs/services/billing.service";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../../../../messages/en.json";
import { OnboardingPlanView } from "../onboarding-plan-view";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const FREE_PLAN = {
  id: "plan-free",
  code: "free" as const,
  maxLocations: 1,
  maxAiDraftsPerMonth: 20,
  maxTeamMembers: 1,
  customPromptsEnabled: false,
};

const PAID_PLAN = {
  id: "plan-paid",
  code: "paid" as const,
  maxLocations: null,
  maxAiDraftsPerMonth: null,
  maxTeamMembers: null,
  customPromptsEnabled: true,
};

// A fresh QueryClient per render so one test's cached query entries can never leak into the next.
function renderView() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <OnboardingPlanView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("OnboardingPlanView", () => {
  beforeEach(() => {
    push.mockClear();
    vi.spyOn(BillingService, "getPlans").mockResolvedValue({
      plans: [FREE_PLAN, PAID_PLAN],
      currentPlanId: FREE_PLAN.id,
    });
  });

  test("shows only the Free plan when PAYMENT_FEATURE_ENABLED is off", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: true,
      passwordLoginEnabled: true,
      socialLoginEnabled: true,
      inviteMembersEnabled: true,
      paymentFeatureEnabled: false,
    });
    renderView();

    expect(await screen.findByText("Free plan")).toBeInTheDocument();
    expect(screen.getByText("1 location")).toBeInTheDocument();
    expect(screen.getByText("20 AI reply drafts a month")).toBeInTheDocument();
    expect(screen.getByText("1 team member")).toBeInTheDocument();
    expect(screen.getByText("Default prompt only")).toBeInTheDocument();
    expect(screen.queryByText("Paid plan")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upgrade to Paid" })).not.toBeInTheDocument();
  });

  test("continuing with Free navigates straight to /onboarding/connect with no backend call", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: true,
      passwordLoginEnabled: true,
      socialLoginEnabled: true,
      inviteMembersEnabled: true,
      paymentFeatureEnabled: false,
    });
    const createCheckoutSession = vi.spyOn(BillingService, "createCheckoutSession");
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Continue with Free" }));

    expect(push).toHaveBeenCalledWith(ROUTES.ONBOARDING_CONNECT);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  test("shows both plans and starts checkout when PAYMENT_FEATURE_ENABLED is on", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: true,
      passwordLoginEnabled: true,
      socialLoginEnabled: true,
      inviteMembersEnabled: true,
      paymentFeatureEnabled: true,
    });
    const createCheckoutSession = vi
      .spyOn(BillingService, "createCheckoutSession")
      .mockResolvedValue({ url: "http://localhost:3002/billing/dummy-checkout?subscriptionId=dummy_sub_1" });
    const originalLocation = window.location;
    // jsdom rejects assigning `window.location.href`; a settable stand-in lets the hard redirect be observed (as in `require-auth.test.tsx`).
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "http://localhost:3002/onboarding/plan" },
    });

    const user = userEvent.setup();
    renderView();

    expect(await screen.findByText("Paid plan")).toBeInTheDocument();
    expect(screen.getByText("Unlimited locations")).toBeInTheDocument();
    expect(screen.getByText("Unlimited AI reply drafts")).toBeInTheDocument();
    expect(screen.getByText("Unlimited team members")).toBeInTheDocument();
    expect(screen.getByText("Full custom prompt editing")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Upgrade to Paid" }));

    await waitFor(() => expect(createCheckoutSession).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(window.location.href).toBe(
        "http://localhost:3002/billing/dummy-checkout?subscriptionId=dummy_sub_1",
      ),
    );

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });
});
