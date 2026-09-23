import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import type { CreateAccountFormValues } from "@/app/(auth)/onboarding/signup/_components/create-account-form";
import { ApiError } from "@/app/_libs/services/api-error";
import {
  AuthService,
  type LoginResult,
  type VerifyOtpResult,
} from "@/app/_libs/services/auth.service";

export interface ResendOtpResult {
  sent: boolean;
  message?: string;
}

interface UseAuthResult {
  loginWithMicrosoft: (email: string) => Promise<void>;
  /** Returns null on failure (a toast is already shown) — the caller only needs to branch on a non-null result. */
  loginWithPassword: (email: string, password: string) => Promise<LoginResult | null>;
  startGoogleLogin: () => void;
  signupWithMicrosoft: () => Promise<boolean>;
  signupWithPassword: (values: CreateAccountFormValues) => Promise<boolean>;
  startGoogleSignup: () => void;
  /** Returns whether it succeeded — a toast is already shown on failure. */
  completeGoogleSignup: (businessName: string) => Promise<boolean>;
  verifySignupOtp: (email: string, code: string) => Promise<VerifyOtpResult>;
  /** Resolves to `{ sent: false }` (never rejects) so the OTP screen can always report an outcome. */
  resendSignupOtp: (email: string) => Promise<ResendOtpResult>;
  logout: () => void;
  isLoading: boolean;
}

/**
 * A 4xx from this API carries copy written for the user — `messages.constants.ts` on the backend
 * plus DTO validation messages — so it is shown as-is. "Invalid email or password." *is* the point
 * of a 401 here; replacing it with "something went wrong" tells the user nothing and hides the one
 * thing they can act on.
 *
 * The generic fallback is reserved for what it actually means: a 5xx, or a network failure that
 * produced no response at all, where there is no server-authored message to show.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500
    ? error.message
    : fallback;
}

/**
 * Auth actions for the login/onboarding screens. Wraps `AuthService` so
 * components never call it directly — swapping the mock service for a real
 * backend call later needs no change here or in any consuming component.
 * Failures surface via toast — there's no inline error UI on either form.
 */
export function useAuth(): UseAuthResult {
  const t = useTranslations("auth.toasts");
  const [isLoading, setIsLoading] = useState(false);

  // `startGoogleLogin`/`startGoogleSignup` below navigate away instead of awaiting anything, on
  // the assumption that the page being replaced makes a reset unnecessary. That holds for a
  // forward navigation, but browser-back can restore this page from bfcache instead of remounting
  // it — the in-memory `isLoading: true` comes back with it, and with no new mount there is no
  // other point that would ever clear it, leaving every social-auth button permanently disabled.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsLoading(false);
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const loginWithMicrosoft = useCallback(
    async (email: string) => {
      setIsLoading(true);
      try {
        await AuthService.loginWithMicrosoft(email);
      } catch (error) {
        toast.error(authErrorMessage(error, t("signInFailed")));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        return await AuthService.loginWithPassword(email, password);
      } catch (error) {
        toast.error(authErrorMessage(error, t("signInFailed")));
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  /**
   * Navigates away rather than awaiting anything, so there is no success path to handle and no
   * `finally` to clear the spinner — the page is being replaced. Failures come back as
   * `?error=` on the destination, which the login and signup views read on mount. The `pageshow`
   * listener above covers the one case where this page isn't actually replaced: the user hits
   * browser-back and it's restored from bfcache instead.
   */
  const startGoogleLogin = useCallback(() => {
    setIsLoading(true);
    AuthService.startGoogleLogin();
  }, []);

  /** Returns whether it succeeded, so the signup wizard knows to advance to step 2. */
  const signupWithMicrosoft = useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.signupWithMicrosoft();
      return true;
    } catch (error) {
      toast.error(authErrorMessage(error, t("signUpFailed")));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const signupWithPassword = useCallback(
    async (values: CreateAccountFormValues) => {
      setIsLoading(true);
      try {
        await AuthService.signupWithPassword(values);
        return true;
      } catch (error) {
        toast.error(authErrorMessage(error, t("signUpFailed")));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const startGoogleSignup = useCallback(() => {
    setIsLoading(true);
    AuthService.startGoogleSignup();
  }, []);

  const completeGoogleSignup = useCallback(
    async (businessName: string) => {
      setIsLoading(true);
      try {
        await AuthService.completeGoogleSignup(businessName);
        return true;
      } catch (error) {
        toast.error(authErrorMessage(error, t("signUpFailed")));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  /** No toast here — the OTP screen shows its own "invalid code"/"resent" copy, not generic auth-failure text. */
  const verifySignupOtp = useCallback(async (email: string, code: string) => {
    setIsLoading(true);
    try {
      return await AuthService.verifySignupOtp(email, code);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Returns whether the resend actually went out. Previously this had no error handling at all,
   * unlike every other method here — so a throttled resend (the endpoint allows 5/min) rejected,
   * the rejection was swallowed by the caller's `void`, and the user saw literally nothing happen.
   */
  const resendSignupOtp = useCallback(async (email: string) => {
    try {
      await AuthService.resendSignupOtp(email);
      return { sent: true };
    } catch (error) {
      return {
        sent: false,
        ...(error instanceof ApiError ? { message: error.message } : {}),
      };
    }
  }, []);

  const logout = useCallback(() => {
    void AuthService.logout().catch(() => {
      toast.error(t("signOutFailed"));
    });
  }, [t]);

  return {
    loginWithMicrosoft,
    loginWithPassword,
    startGoogleLogin,
    signupWithMicrosoft,
    signupWithPassword,
    startGoogleSignup,
    completeGoogleSignup,
    verifySignupOtp,
    resendSignupOtp,
    logout,
    isLoading,
  };
}
