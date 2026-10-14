import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { PlatformSection } from "../platform-section";

const update = vi.hoisted(() => vi.fn());
const confirmLockout = vi.hoisted(() => vi.fn());
const dismissLockout = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ pendingLockout: null as { message: string } | null }));

vi.mock("@/hooks/common/use-platform-settings", () => ({
  usePlatformSettings: () => ({
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    data: {
      microsoftLoginEnabled: true,
      passwordLoginEnabled: true,
      googleLoginEnabled: true,
      inviteMembersEnabled: true,
      notificationSettingsEnabled: false,
    },
  }),
}));
vi.mock("@/hooks/admin/use-update-platform-settings", () => ({
  useUpdatePlatformSettings: () => ({
    update,
    isUpdating: false,
    pendingLockout: state.pendingLockout,
    confirmLockout,
    dismissLockout,
  }),
}));

const LOCKOUT_MESSAGE = "Google is the only way 2 users can sign in. Confirm to turn it off anyway.";

function renderSection() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PlatformSection />
    </NextIntlClientProvider>,
  );
}

describe("PlatformSection lockout confirmation", () => {
  beforeEach(() => {
    update.mockReset();
    confirmLockout.mockReset();
    dismissLockout.mockReset();
    state.pendingLockout = null;
  });

  test("shows no dialog while nothing is held back", () => {
    renderSection();

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("asks with the server's message when a change would lock users out, and confirming goes ahead", async () => {
    state.pendingLockout = { message: LOCKOUT_MESSAGE };
    renderSection();

    expect(screen.getByRole("alertdialog")).toHaveTextContent(LOCKOUT_MESSAGE);
    await userEvent.click(
      screen.getByRole("button", { name: messages.adminSettings.platform.lockout.confirm }),
    );

    expect(confirmLockout).toHaveBeenCalledTimes(1);
  });

  test("cancelling keeps the provider on and sends nothing", async () => {
    state.pendingLockout = { message: LOCKOUT_MESSAGE };
    renderSection();

    await userEvent.click(
      screen.getByRole("button", { name: messages.adminSettings.platform.lockout.cancel }),
    );

    expect(dismissLockout).toHaveBeenCalled();
    expect(confirmLockout).not.toHaveBeenCalled();
  });
});
