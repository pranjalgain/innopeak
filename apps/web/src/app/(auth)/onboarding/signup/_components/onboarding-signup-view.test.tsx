import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import { OnboardingSignupView } from "./onboarding-signup-view";
import messages from "../../../../../../messages/en.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OnboardingSignupView />
    </NextIntlClientProvider>,
  );
}

describe("OnboardingSignupView", () => {
  test("starts on the identity step with no business-name field anywhere", () => {
    renderView();

    expect(screen.getByRole("button", { name: "Continue with Microsoft" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByText(/business name/i)).not.toBeInTheDocument();

    // The SSO-only path (default AUTH_METHODS) is a 2-step stepper — no OTP step.
    expect(screen.getByText("Create account")).toBeInTheDocument();
    expect(screen.getByText("Connect business profile")).toBeInTheDocument();
    expect(screen.queryByText("Verify email")).not.toBeInTheDocument();
  });

  test("advances to the connect step after continuing with Microsoft", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "Continue with Microsoft" }));

    expect(await screen.findByRole("button", { name: "Connect Google Business Profile" })).toBeInTheDocument();
  });
});
