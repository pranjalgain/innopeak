import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { AuthService } from "@/app/_libs/services/auth.service";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";

import messages from "../../../../../../../messages/en.json";
import { BusinessNameView } from "../business-name-view";

const replace = vi.fn();
const toastError = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

vi.mock("sonner", () => ({
  toast: { error: (message: string) => toastError(message), success: vi.fn() },
}));

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BusinessNameView />
    </NextIntlClientProvider>,
  );
}

describe("BusinessNameView", () => {
  beforeEach(() => {
    replace.mockClear();
    toastError.mockClear();
    window.sessionStorage.clear();
  });

  test("shows a required-field error rather than submitting an empty name", async () => {
    const completeSsoSignup = vi.spyOn(AuthService, "completeSsoSignup");
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Enter your business name.")).toBeInTheDocument();
    expect(completeSsoSignup).not.toHaveBeenCalled();
  });

  test("submits the trimmed name, then hands off to /onboarding/plan as the SSO path", async () => {
    const completeSsoSignup = vi
      .spyOn(AuthService, "completeSsoSignup")
      .mockResolvedValueOnce({ hasConnectedBusiness: false });
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText("Business name"), "  The Coastal Table  ");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(completeSsoSignup).toHaveBeenCalledWith("The Coastal Table");
    await waitFor(() => expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_PLAN));
    // /onboarding/plan's stepper reads this — same handoff shape the Microsoft SSO path uses.
    expect(OnboardingContextService.get()).toEqual({ from: "signup", via: "sso" });
  });

  test("a failed completion (expired pending signup) shows a toast and does not redirect", async () => {
    vi.spyOn(AuthService, "completeSsoSignup").mockRejectedValueOnce(
      new ApiError(400, "This signup has expired. Start again from the sign-up page."),
    );
    const user = userEvent.setup();
    renderView();

    await user.type(screen.getByLabelText("Business name"), "The Coastal Table");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'This signup has expired. Start again from the sign-up page.',
      ),
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
