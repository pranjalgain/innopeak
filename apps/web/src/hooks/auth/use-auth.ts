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
  /** Returns null on failure (a toast is already shown) — the caller only needs to branch on a non-null result. */
  loginWithPassword: (email: string, password: string) => Promise<LoginResult | null>;
  /** Undoes the owner's own pending deletion. Returns whether it worked — a toast is already shown on failure. */
  restoreAccount: (email: string, password: string) => Promise<boolean>;
  startGoogleLogin: () => void;
  startMicrosoftLogin: () => void;
  signupWithPassword: (values: CreateAccountFormValues) => Promise<boolean>;
  startGoogleSignup: () => void;
  startMicrosoftSignup: () => void;
  /** Returns whether it succeeded — a toast is already shown on failure. */
  completeSsoSignup: (businessName: string) => Promise<boolean>;
  verifySignupOtp: (email: string, code: string) => Promise<VerifyOtpResult>;
  /** Resolves to `{ sent: false }` (never rejects) so the OTP screen can always report an outcome. */
  resendSignupOtp: (email: string) => Promise<ResendOtpResult>;
  logout: () => void;
  isLoading: boolean;
}

/**
 * A 4xx carries copy written for the user, so it is shown as-is ("Invalid email or password" is the
 * point of a 401). The generic fallback is only for a 5xx or a network failure with no server message.
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500
    ? error.message
    : fallback;
}

/** Auth actions for the login/onboarding screens; failures surface via toast. */
export function useAuth(): UseAuthResult {
  const t = useTranslations("auth.toasts");
  const [isLoading, setIsLoading] = useState(false);

  // Google/Microsoft login/signup navigate away, but browser-back can restore this page from bfcache with
  // `isLoading: true` and no remount, leaving every social-auth button disabled.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsLoading(false);
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

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

  const restoreAccount = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        await AuthService.restoreAccount(email, password);
        return true;
      } catch (error) {
        toast.error(authErrorMessage(error, t("restoreFailed")));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  /**
   * Navigates away, so there is no `finally` to clear the spinner. Failures come back as `?error=`
   * on the destination; the `pageshow` listener above covers a bfcache restore.
   */
  const startGoogleLogin = useCallback(() => {
    setIsLoading(true);
    AuthService.startGoogleLogin();
  }, []);

  const startMicrosoftLogin = useCallback(() => {
    setIsLoading(true);
    AuthService.startMicrosoftLogin();
  }, []);

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

  const startMicrosoftSignup = useCallback(() => {
    setIsLoading(true);
    AuthService.startMicrosoftSignup();
  }, []);

  const completeSsoSignup = useCallback(
    async (businessName: string) => {
      setIsLoading(true);
      try {
        await AuthService.completeSsoSignup(businessName);
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

  /** Returns whether the resend went out; a throttled resend (5/min) must not fail silently. */
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
    loginWithPassword,
    restoreAccount,
    startGoogleLogin,
    startMicrosoftLogin,
    signupWithPassword,
    startGoogleSignup,
    startMicrosoftSignup,
    completeSsoSignup,
    verifySignupOtp,
    resendSignupOtp,
    logout,
    isLoading,
  };
}
