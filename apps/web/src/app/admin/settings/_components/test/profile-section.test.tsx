import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { ProfileSection } from "../profile-section";

const changePassword = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock("@/hooks/admin/use-platform-admin-profile", () => ({
  usePlatformAdminProfile: () => ({
    profile: { email: "admin@innopeak.com", avatarUrl: null, hasPassword: true },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    updateAvatar: vi.fn(),
    isUploadingAvatar: false,
    changePassword,
    isChangingPassword: false,
    requestSetPasswordOtp: vi.fn(),
    isSendingSetPasswordOtp: false,
    setPassword: vi.fn(),
    isSettingPassword: false,
  }),
}));
vi.mock("@/components/common/avatar-upload", () => ({ AvatarUpload: () => null }));

const t = messages.adminSettings.profile;

async function openChangePassword() {
  const user = userEvent.setup();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProfileSection />
    </NextIntlClientProvider>,
  );
  await user.click(screen.getByRole("button", { name: t.changePassword }));
  return user;
}

describe("ProfileSection — change password", () => {
  // bcrypt reads only 72 bytes and the API refuses more, so a checklist that is all green must not end in a server error.
  test("refuses a new password over 72 bytes, saying why, even though every rule is met", async () => {
    const user = await openChangePassword();
    const tooLong = `Aa1!${"a".repeat(70)}`;

    await user.type(screen.getByLabelText(t.currentPasswordLabel), "Current@Pass1");
    await user.type(screen.getByLabelText(t.newPasswordLabel), tooLong);
    await user.type(screen.getByLabelText(t.confirmPasswordLabel), tooLong);

    expect(screen.getByText(t.passwordTooLong)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.updatePassword })).toBeDisabled();
  });

  test("accepts a password that fits", async () => {
    const user = await openChangePassword();

    await user.type(screen.getByLabelText(t.currentPasswordLabel), "Current@Pass1");
    await user.type(screen.getByLabelText(t.newPasswordLabel), "NewStr0ng@Pass");
    await user.type(screen.getByLabelText(t.confirmPasswordLabel), "NewStr0ng@Pass");

    expect(screen.queryByText(t.passwordTooLong)).toBeNull();
    expect(screen.getByRole("button", { name: t.updatePassword })).toBeEnabled();
  });
});
