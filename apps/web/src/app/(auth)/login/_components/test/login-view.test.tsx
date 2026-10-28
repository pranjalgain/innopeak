import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { LoginView } from "../login-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

const auth = vi.hoisted(() => ({
  startGoogleLogin: vi.fn(),
  startMicrosoftLogin: vi.fn(),
}));
vi.mock("@/hooks/auth/use-auth", () => ({
  useAuth: () => ({
    loginWithPassword: vi.fn(),
    restoreAccount: vi.fn(),
    verifySignupOtp: vi.fn(),
    resendSignupOtp: vi.fn(),
    isLoading: false,
    ...auth,
  }),
}));
vi.mock("@/hooks/auth/use-oauth-error-toast", () => ({ useOAuthErrorToast: () => undefined }));
vi.mock("@/hooks/auth/use-otp-verification", () => ({
  useOtpVerification: () => ({ handleVerify: vi.fn(), handleResend: vi.fn() }),
}));

interface Settings {
  passwordLoginEnabled: boolean;
  microsoftLoginEnabled: boolean;
  googleLoginEnabled: boolean;
}
const query = vi.hoisted(() => ({
  data: undefined as Settings | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));
vi.mock("@/hooks/common/use-platform-settings", () => ({
  usePlatformSettings: () => query,
}));

const t = messages.auth.login;
const emailLabel = messages.auth.passwordForm.emailLabel;

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <LoginView />
    </NextIntlClientProvider>,
  );
}

describe("LoginView — the platform's email/password switch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.data = undefined;
    query.isLoading = false;
    query.isError = false;
  });

  test("shows the password form, then a divider above the provider buttons, while the switch is on", () => {
    query.data = { passwordLoginEnabled: true, microsoftLoginEnabled: true, googleLoginEnabled: false };
    renderView();

    expect(screen.getByLabelText(emailLabel)).toBeTruthy();
    expect(screen.getByText(t.orDivider)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.continueWithMicrosoft })).toBeTruthy();
  });

  // Regression: the form used to be always on, so a platform with no way to send email still offered a sign-in that could not finish.
  test("hides the password form and the divider while the switch is off, leaving the provider buttons", () => {
    query.data = { passwordLoginEnabled: false, microsoftLoginEnabled: true, googleLoginEnabled: true };
    renderView();

    expect(screen.queryByLabelText(emailLabel)).toBeNull();
    expect(screen.queryByText(t.orDivider)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.microsoft }));
    fireEvent.click(screen.getByRole("button", { name: t.google }));
    expect(auth.startMicrosoftLogin).toHaveBeenCalledOnce();
    expect(auth.startGoogleLogin).toHaveBeenCalledOnce();
  });

  test("still links to sign-up and the admin sign-in with the password form hidden", () => {
    query.data = { passwordLoginEnabled: false, microsoftLoginEnabled: true, googleLoginEnabled: false };
    renderView();

    expect(screen.getByRole("link", { name: t.signUp })).toBeTruthy();
    expect(screen.getByRole("link", { name: t.adminSignIn })).toBeTruthy();
  });

  // No form that appears and then disappears when the platform has it off.
  test("holds a placeholder instead of the form while the settings load", () => {
    query.isLoading = true;
    renderView();

    expect(screen.getByTestId("login-form-loading")).toBeTruthy();
    expect(screen.queryByLabelText(emailLabel)).toBeNull();
  });

  // The server refuses a password sign-in itself when it is off, so an unreadable setting should not leave an empty card.
  test("keeps the password form when the settings cannot be loaded, with a way to retry", () => {
    query.isError = true;
    renderView();

    expect(screen.getByLabelText(emailLabel)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.ssoUnavailableRetry }));
    expect(query.refetch).toHaveBeenCalledOnce();
  });
});
