import { act, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type * as React from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ApiError } from "@/app/_libs/services/api-error";
import { AuthService } from "@/app/_libs/services/auth.service";

import messages from "../../../../messages/en.json";
import { useAuth } from "../use-auth";

const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: (message: string) => toastError(message),
    success: vi.fn(),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

const GENERIC_SIGN_IN = messages.auth.toasts.signInFailed;

describe("useAuth error toasts", () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  test("a 401 shows the API's own message, not the generic fallback", async () => {
    vi.spyOn(AuthService, "loginWithPassword").mockRejectedValueOnce(
      new ApiError(401, "Invalid email or password."),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.loginWithPassword("someone@example.com", "wrong-password");
    });

    expect(toastError).toHaveBeenCalledWith("Invalid email or password.");
    expect(toastError).not.toHaveBeenCalledWith(GENERIC_SIGN_IN);
  });

  test("a 403 (disabled account / suspended tenant) also surfaces its message", async () => {
    vi.spyOn(AuthService, "loginWithPassword").mockRejectedValueOnce(
      new ApiError(403, "This account has been disabled."),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.loginWithPassword("someone@example.com", "pw");
    });

    expect(toastError).toHaveBeenCalledWith("This account has been disabled.");
  });

  test("a 5xx falls back to the generic message — there is no user-authored copy to show", async () => {
    vi.spyOn(AuthService, "loginWithPassword").mockRejectedValueOnce(
      new ApiError(500, "Internal server error"),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.loginWithPassword("someone@example.com", "pw");
    });

    expect(toastError).toHaveBeenCalledWith(GENERIC_SIGN_IN);
  });

  test("a network failure (no ApiError at all) falls back to the generic message", async () => {
    vi.spyOn(AuthService, "loginWithPassword").mockRejectedValueOnce(new TypeError("fetch failed"));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.loginWithPassword("someone@example.com", "pw");
    });

    expect(toastError).toHaveBeenCalledWith(GENERIC_SIGN_IN);
  });

  test("signup failures fall back to signup copy, not 'signing in'", async () => {
    vi.spyOn(AuthService, "signupWithPassword").mockRejectedValueOnce(new TypeError("fetch failed"));

    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signupWithPassword({
        name: "Jordan Lee",
        businessName: "The Coffee House",
        email: "jordan@coffeehouse.com",
        password: "Password1!",
      });
    });

    expect(toastError).toHaveBeenCalledWith(messages.auth.toasts.signUpFailed);
  });

  test("a failed Google-signup completion surfaces the backend's own message", async () => {
    vi.spyOn(AuthService, "completeGoogleSignup").mockRejectedValueOnce(
      new ApiError(400, "This signup has expired. Start again with \"Continue with Google\"."),
    );

    const { result } = renderHook(() => useAuth(), { wrapper });
    let succeeded: boolean | undefined;
    await act(async () => {
      succeeded = await result.current.completeGoogleSignup("The Coastal Table");
    });

    expect(succeeded).toBe(false);
    expect(toastError).toHaveBeenCalledWith(
      'This signup has expired. Start again with "Continue with Google".',
    );
  });
});
