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
    | { googleLoginEnabled: boolean; adminGoogleLoginAvailable?: boolean; adminMicrosoftLoginAvailable?: boolean }
    | undefined,
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

  test("offers only the password form while neither provider is set up on this deploy", () => {
    settings.value = { googleLoginEnabled: true, adminGoogleLoginAvailable: false, adminMicrosoftLoginAvailable: false };
    renderView();

    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Microsoft/ })).toBeNull();
    expect(screen.queryByText(t.orDivider)).toBeNull();
  });

  // An admin who accepted through Google has no password: the button follows whether Google is set up, never the tenant switch.
  test("offers Google whenever it is set up, whatever the tenant Google switch says", () => {
    settings.value = { googleLoginEnabled: false, adminGoogleLoginAvailable: true, adminMicrosoftLoginAvailable: false };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: t.continueWithGoogle }));

    expect(login.startAdminGoogleLogin).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Microsoft/ })).toBeNull();
  });

  // Without a Google client the button only led to a "not configured" error.
  test("hides Google on a deploy where it is not set up, even with the tenant switch on", () => {
    settings.value = { googleLoginEnabled: true, adminGoogleLoginAvailable: false, adminMicrosoftLoginAvailable: true };
    renderView();

    expect(screen.queryByRole("button", { name: /Google/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: t.continueWithMicrosoft }));
    expect(login.startAdminMicrosoftLogin).toHaveBeenCalledOnce();
  });

  test("shows both side by side with their short labels when both are set up", () => {
    settings.value = { googleLoginEnabled: false, adminGoogleLoginAvailable: true, adminMicrosoftLoginAvailable: true };
    renderView();

    fireEvent.click(screen.getByRole("button", { name: t.microsoft }));
    fireEvent.click(screen.getByRole("button", { name: t.google }));

    expect(login.startAdminMicrosoftLogin).toHaveBeenCalledOnce();
    expect(login.startAdminGoogleLogin).toHaveBeenCalledOnce();
  });
});
