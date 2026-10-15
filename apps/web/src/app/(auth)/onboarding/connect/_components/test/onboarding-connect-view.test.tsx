import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";

import messages from "../../../../../../../messages/en.json";
import { OnboardingConnectView } from "../onboarding-connect-view";

const replace = vi.fn();
// Stable across renders, like Next's own: the view's effect depends on `router`, so a fresh object each render would loop.
const push = vi.fn();
const router = { push, replace };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

const useOnboardingConnectFlow = vi.fn();

// Payments on by default, so the plan step (and "back to plan selection") exists unless a test turns it off.
const platformSettings = vi.hoisted(() => ({ paymentFeatureEnabled: true as boolean | undefined }));
vi.mock("@/hooks/common/use-platform-settings", () => ({
  usePlatformSettings: () => ({
    data:
      platformSettings.paymentFeatureEnabled === undefined
        ? undefined
        : { paymentFeatureEnabled: platformSettings.paymentFeatureEnabled },
  }),
}));

vi.mock("@/hooks/onboarding/use-onboarding-connect-flow", () => ({
  useOnboardingConnectFlow: () => useOnboardingConnectFlow(),
}));

const flowAtConnectStage = () => ({
    stage: "connect",
    error: null,
    accounts: [],
    selectedAccountId: null,
    selectAccount: vi.fn(),
    confirmAccount: vi.fn(),
    locations: [],
    selectedLocationIds: [],
    isSingleSelect: false,
    progress: null,
    reviewsFetched: 0,
    totalToImport: null,
    isSlow: false,
    startConnect: vi.fn(),
    toggleLocation: vi.fn(),
    confirmLocation: vi.fn(),
    retry: vi.fn(),
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OnboardingConnectView />
    </NextIntlClientProvider>,
  );
}

describe("OnboardingConnectView plan gate", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
    platformSettings.paymentFeatureEnabled = true;
    useOnboardingConnectFlow.mockReset();
    useOnboardingConnectFlow.mockImplementation(flowAtConnectStage);
    window.sessionStorage.clear();
  });

  describe("changing plan", () => {
    test("is offered on Free, and going back forgets the choice so the plan must be picked again", async () => {
      OnboardingContextService.set({ from: "signup", via: "sso", plan: "free" });
      const user = userEvent.setup();
      renderView();

      await user.click(await screen.findByRole("button", { name: "← Back to plan selection" }));

      expect(push).toHaveBeenCalledWith(ROUTES.ONBOARDING_PLAN);
      expect(OnboardingContextService.get()?.plan).toBeUndefined();
    });

    // A second payment is what the plan screen would invite.
    test("is not offered once Paid", async () => {
      OnboardingContextService.set({ from: "signup", via: "sso", plan: "paid" });
      renderView();

      await screen.findByRole("button", { name: "Connect Google Business Profile" });
      expect(screen.queryByRole("button", { name: "← Back to plan selection" })).not.toBeInTheDocument();
    });

    // The plan step is skipped when payments are off, so there is no plan screen to go back to.
    test("is not offered when the payment feature is off", async () => {
      platformSettings.paymentFeatureEnabled = false;
      OnboardingContextService.set({ from: "signup", via: "sso", plan: "free" });
      renderView();

      await screen.findByRole("button", { name: "Connect Google Business Profile" });
      expect(screen.queryByRole("button", { name: "← Back to plan selection" })).not.toBeInTheDocument();
    });

    test("is not offered to an owner reconnecting from Settings", async () => {
      renderView();

      await screen.findByRole("button", { name: "Connect Google Business Profile" });
      expect(screen.queryByRole("button", { name: "← Back to plan selection" })).not.toBeInTheDocument();
    });
  });

  // Regression: backing out of Stripe dropped a fresh signup here with Free selected for them.
  test("sends a fresh signup who has not chosen a plan back to the plan screen", async () => {
    OnboardingContextService.set({ from: "signup", via: "sso" });

    renderView();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_PLAN));
    // Never started: its resume calls the API and consumes the OAuth callback's query params.
    expect(useOnboardingConnectFlow).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Connect Google Business Profile" })).not.toBeInTheDocument();
  });

  test.each(["free", "paid"] as const)("opens for a signup who chose the %s plan", async (plan) => {
    OnboardingContextService.set({ from: "signup", via: "sso", plan });

    renderView();

    expect(
      await screen.findByRole("button", { name: "Connect Google Business Profile" }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  // Regression guard for the deploy: someone mid-wizard (e.g. back from the Google grant) has a context with no plan marker.
  test("opens for a signup whose context predates plan gating, rather than bouncing them", async () => {
    window.sessionStorage.setItem(
      "innopeak:onboarding-context",
      JSON.stringify({ from: "signup", via: "sso" }),
    );

    renderView();

    expect(
      await screen.findByRole("button", { name: "Connect Google Business Profile" }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("opens for an owner reconnecting from Settings, who is not in the signup wizard", async () => {
    renderView();

    expect(
      await screen.findByRole("button", { name: "Connect Google Business Profile" }),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
