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
  usePathname: () => "/invite/raw-token-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const PASSWORD = "NewStr0ng@Pass";

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

describe("AcceptInviteView", () => {
  beforeEach(() => {
    // `vi.spyOn` returns the *same* mock for an already-spied method, so without this a call made
    // in one test is still on the record in the next — enough to make a "was never called"
    // assertion pass or fail for the wrong reason.
    vi.clearAllMocks();
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: false,
      passwordLoginEnabled: true,
      socialLoginEnabled: true,
      inviteMembersEnabled: true,
    });
    vi.spyOn(AuthService, "validateAdminInvite").mockResolvedValue({
      email: "priya.ops@innopeak.com",
    });
  });

  test("shows the invited address once the token validates", async () => {
    renderView();

    expect(
      await screen.findByText(
        "Set a password to finish setting up priya.ops@innopeak.com, or continue with Google.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  /** The subtitle is the only instruction on this screen, so it has to name whichever ways to
   *  finish are actually on offer — not the password half while a Google button sits below it. */
  test("names only the password option when Google is not offered", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: false,
      passwordLoginEnabled: true,
      socialLoginEnabled: false,
      inviteMembersEnabled: true,
    });

    renderView();

    expect(
      await screen.findByText("Set a password to finish setting up priya.ops@innopeak.com."),
    ).toBeInTheDocument();
  });

  /** A dead link is a dead end — never the password form, which could only fail on submit. */
  test("renders the invalid state, not the form, for a token the backend rejects", async () => {
    vi.spyOn(AuthService, "validateAdminInvite").mockRejectedValue(
      new ApiError(404, "This invite link is invalid or has expired."),
    );

    renderView();

    expect(await screen.findByText("This invite isn't valid")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept invite" })).not.toBeInTheDocument();
  });

  test("accepts with a password and routes on to the admin console", async () => {
    const acceptAdminInvite = vi.spyOn(AuthService, "acceptAdminInvite").mockResolvedValue();
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), PASSWORD);
    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    await waitFor(() => expect(acceptAdminInvite).toHaveBeenCalledWith("raw-token-1", PASSWORD));
    await waitFor(() => expect(push).toHaveBeenCalledWith(ROUTES.ADMIN));
  });

  test("refuses to submit when the confirmation does not match", async () => {
    const acceptAdminInvite = vi.spyOn(AuthService, "acceptAdminInvite").mockResolvedValue();
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Password"), PASSWORD);
    await user.type(screen.getByLabelText("Confirm password"), "Different@Pass1");
    await user.click(screen.getByRole("button", { name: "Accept invite" }));

    expect(await screen.findByText("Passwords don't match.")).toBeInTheDocument();
    expect(acceptAdminInvite).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  test("stays on the page when acceptance fails", async () => {
    vi.spyOn(AuthService, "acceptAdminInvite").mockRejectedValue(
      new ApiError(400, "This invite link is invalid or has expired."),
    );
    const user = userEvent.setup();
    renderView();

    await user.type(await screen.findByLabelText("Password"), PASSWORD);
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

  /**
   * Regression: accepting through Google leaves the admin with no `password_hash`, so Google
   * becomes their only credential — and `/login` hides its Google button behind this same
   * setting. Offering it here while the platform has social sign-in off minted an admin whose one
   * way in was a button that is never rendered, with no admin `set-password` flow to recover
   * through.
   */
  test("hides Google when the platform has social sign-in disabled", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ssoLoginEnabled: false,
      passwordLoginEnabled: true,
      socialLoginEnabled: false,
      inviteMembersEnabled: true,
    });

    renderView();

    // The password form is always available, so waiting on it proves the card has rendered and
    // the Google button's absence below is a real decision rather than a not-yet-loaded screen.
    expect(await screen.findByLabelText("Password")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with Google" }),
    ).not.toBeInTheDocument();
  });

  test("starts the Google round trip for this specific invite token", async () => {
    const startAdminInviteGoogle = vi
      .spyOn(AuthService, "startAdminInviteGoogle")
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderView();

    await user.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(startAdminInviteGoogle).toHaveBeenCalledWith("raw-token-1");
  });
});
