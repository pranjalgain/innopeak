import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { AdminLoginView } from "../admin-login-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin-login",
  useSearchParams: () => new URLSearchParams(),
}));

const login = vi.hoisted(() => ({
  startAdminGoogleLogin: vi.fn(),
  startAdminMicrosoftLogin: vi.fn(),
}));
vi.mock("@/hooks/auth/use-admin-login", () => ({
  useAdminLogin: () => ({ loginAsAdmin: vi.fn(), isLoading: false, ...login }),
}));

const settings = vi.hoisted(() => ({
  value: undefined as
    { googleLoginEnabled: boolean; adminMicrosoftLoginAvailable?: boolean } | undefined,
}));
vi.mock("@/hooks/common/use-platform-settings", () => ({
  usePlatformSettings: () => ({ data: settings.value }),
}));

const t = messages.auth.adminLogin;

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminLoginView />
    </NextIntlClientProvider>,
  );
}

describe("AdminLoginView — social sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings.value = undefined;
  });

  test("offers only the password form while neither provider is available", () => {
    settings.value = { googleLoginEnabled: false, adminMicrosoftLoginAvailable: false };
    renderView();

    expect(screen.queryByRole("button", { name: /Microsoft/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    expect(screen.queryByText(t.orDivider)).toBeNull();
  });

  test("shows Continue with Microsoft alone, and it starts the admin Microsoft sign-in", () => {
    settings.value = { googleLoginEnabled: false, adminMicrosoftLoginAvailable: true };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: t.continueWithMicrosoft }));

    expect(login.startAdminMicrosoftLogin).toHaveBeenCalledOnce();
    expect(login.startAdminGoogleLogin).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
  });

  // Admin Microsoft follows the deploy (client + pinned directory), not the tenant-facing switch.
  test("does not depend on the tenant Microsoft switch", () => {
    settings.value = {
      googleLoginEnabled: false,
      adminMicrosoftLoginAvailable: true,
      microsoftLoginEnabled: false,
    } as never;
    renderView();

    expect(screen.getByRole("button", { name: t.continueWithMicrosoft })).toBeTruthy();
  });

  test("shows both providers side by side with their short labels when both are available", () => {
    settings.value = { googleLoginEnabled: true, adminMicrosoftLoginAvailable: true };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: t.microsoft }));
    fireEvent.click(screen.getByRole("button", { name: t.google }));

    expect(login.startAdminMicrosoftLogin).toHaveBeenCalledOnce();
    expect(login.startAdminGoogleLogin).toHaveBeenCalledOnce();
  });

  test("keeps the Google button when only Google is on", () => {
    settings.value = { googleLoginEnabled: true };
    renderView();

    expect(screen.getByRole("button", { name: t.continueWithGoogle })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Microsoft/ })).toBeNull();
  });
});
