import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { AuthService } from "@/app/_libs/services/auth.service";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../../../../messages/en.json";
import { AcceptInviteView } from "../accept-invite-view";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/accept-invite/raw-token-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const PASSWORD = "NewStr0ng@Pass";
const NAME = "Sam Rivera";

/** A fresh QueryClient per render so one test's cached `["platform-settings"]` can't leak. */
function renderView() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <AcceptInviteView token="raw-token-1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AcceptInviteView (tenant member)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: false,
      passwordLoginEnabled: true,
      socialLoginEnabled: true,
      inviteMembersEnabled: true,
    });
    vi.spyOn(AuthService, "validateMemberInvite").mockResolvedValue({
      email: "sam.rivera@thecoffeehouse.com",
    });
  });

  test("shows the invited address once the token validates", async () => {
    renderView();

    expect(
      await screen.findByText(
        "Set up your account to join as sam.rivera@thecoffeehouse.com, or continue with Google.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  test("names only the password option when Google is not offered", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: false,
      passwordLoginEnabled: true,
      socialLoginEnabled: false,
      inviteMembersEnabled: true,
    });

    renderView();

    expect(
      await screen.findByText("Set up your account to join as sam.rivera@thecoffeehouse.com."),
    ).toBeInTheDocument();
  });

  /** A dead link is a dead end — never the name/password form, which could only fail on submit. */
  test("renders the invalid state, not the form, for a token the backend rejects", async () => {
    vi.spyOn(AuthService, "validateMemberInvite").mockRejectedValue(
      new ApiError(404, "This invite link is invalid or has expired."),
    );

    renderView();

    expect(await screen.findByText("This invite isn't valid")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invite" })).not.toBeInTheDocument();
  });

  /**
   * Regression: only a 404 means the invite itself is dead. A network drop, a 5xx, or the
   * validate route's own rate limit used to land on the exact same hard dead end — "ask whoever
   * invited you to send a new one" — for something that had nothing to do with the token and
   * could resolve on its own. This state offers a retry instead, and is not "invalid".
   */
  test("offers a retry, not the dead-end invalid screen, when validation fails for a reason other than a 404", async () => {
    vi.spyOn(AuthService, "validateMemberInvite").mockRejectedValue(
      new ApiError(500, "Internal server error"),
    );

    renderView();

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByText("This invite isn't valid")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  test("retrying re-validates the token and shows the form once it succeeds", async () => {
    const validate = vi
      .spyOn(AuthService, "validateMemberInvite")
      .mockRejectedValueOnce(new ApiError(500, "Internal server error"))
      .mockResolvedValueOnce({ email: "sam.rivera@thecoffeehouse.com" });
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText(
        "Set up your account to join as sam.rivera@thecoffeehouse.com, or continue with Google.",
      ),
    ).toBeInTheDocument();
    expect(validate).toHaveBeenCalledTimes(2);
  });

  test("accepts with a name and password, and routes to the dashboard when a business is already connected", async () => {
    const acceptMemberInvite = vi
      .spyOn(AuthService, "acceptMemberInvite")
      .mockResolvedValue({ hasConnectedBusiness: true });
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Your name"), NAME);
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    await waitFor(() =>
      expect(acceptMemberInvite).toHaveBeenCalledWith("raw-token-1", NAME, PASSWORD),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.DASHBOARD));
  });

  /** Rare, but real: an invite accepted before the owner has connected anything yet. */
  test("routes to the connect stepper when no business is connected yet", async () => {
    vi.spyOn(AuthService, "acceptMemberInvite").mockResolvedValue({
      hasConnectedBusiness: false,
    });
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Your name"), NAME);
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.ONBOARDING_CONNECT));
  });

  /**
   * Regression: the requirements checklist covers every rule it tracks (length, case, digit,
   * special character) except the max-length rule, so a password over 128 characters left the
   * checklist showing all-green while the form stayed invalid with no visible reason why.
   */
  test("shows the max-length error when the checklist has nothing left to flag", async () => {
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Your name"), NAME);
    await user.type(screen.getByLabelText("Password"), `${"Aa1!".repeat(32)}Aa1!`);
    // `mode: "onTouched"` only validates a field on blur the first time — tabbing away is what
    // actually populates `errors.password` here, the same way a real user leaving the field would.
    await user.tab();

    expect(
      await screen.findByText("Password must be 128 characters or fewer."),
    ).toBeInTheDocument();
  });

  test("refuses to submit when the confirmation does not match", async () => {
    const acceptMemberInvite = vi.spyOn(AuthService, "acceptMemberInvite");
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Your name"), NAME);
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), "Different@Pass1");
    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(acceptMemberInvite).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("stays on the page when acceptance fails", async () => {
    vi.spyOn(AuthService, "acceptMemberInvite").mockRejectedValue(
      new ApiError(400, "This invite link is invalid or has expired."),
    );
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Your name"), NAME);
    await user.type(screen.getByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    await waitFor(() => expect(screen.getByLabelText("Password")).toBeInTheDocument());
    expect(push).not.toHaveBeenCalled();
  });

  test("offers Google when the platform has social sign-in enabled", async () => {
    renderView();

    expect(
      await screen.findByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  test("hides Google when the platform has social sign-in disabled", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: false,
      passwordLoginEnabled: true,
      socialLoginEnabled: false,
      inviteMembersEnabled: true,
    });

    renderView();

    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();
  });

  test("starts the Google round trip for this specific invite token", async () => {
    const startMemberInviteGoogle = vi
      .spyOn(AuthService, "startMemberInviteGoogle")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(startMemberInviteGoogle).toHaveBeenCalledWith("raw-token-1");
  });
});
