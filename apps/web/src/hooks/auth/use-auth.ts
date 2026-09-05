import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { AuthService } from "@/app/_libs/services/auth.service";

interface UseAuthResult {
  loginWithMicrosoft: (email: string) => Promise<void>;
  loginWithPassword: (email: string) => Promise<void>;
  loginWithSocial: () => Promise<void>;
  signupWithMicrosoft: () => Promise<boolean>;
  signupWithPassword: () => Promise<boolean>;
  signupWithSocial: () => Promise<boolean>;
  verifySignupOtp: (code: string) => Promise<boolean>;
  resendSignupOtp: () => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

/**
 * Auth actions for the login/onboarding screens. Wraps `AuthService` so
 * components never call it directly — swapping the mock service for a real
 * backend call later needs no change here or in any consuming component.
 * Failures surface via toast — there's no inline error UI on either form.
 */
export function useAuth(): UseAuthResult {
  const t = useTranslations("auth.toasts");
  const [isLoading, setIsLoading] = React.useState(false);

  const loginWithMicrosoft = React.useCallback(
    async (email: string) => {
      setIsLoading(true);
      try {
        await AuthService.loginWithMicrosoft(email);
      } catch {
        toast.error(t("signInFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const loginWithPassword = React.useCallback(
    async (email: string) => {
      setIsLoading(true);
      try {
        await AuthService.loginWithPassword(email);
      } catch {
        toast.error(t("signInFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  const loginWithSocial = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.loginWithSocial();
    } catch {
      toast.error(t("signInFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  /** Returns whether it succeeded, so the signup wizard knows to advance to step 2. */
  const signupWithMicrosoft = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.signupWithMicrosoft();
      return true;
    } catch {
      toast.error(t("signInFailed"));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const signupWithPassword = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.signupWithPassword();
      return true;
    } catch {
      toast.error(t("signInFailed"));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const signupWithSocial = React.useCallback(async () => {
    setIsLoading(true);
    try {
      await AuthService.signupWithSocial();
      return true;
    } catch {
      toast.error(t("signInFailed"));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  /** No toast here — the OTP screen shows its own "invalid code"/"resent" copy, not generic auth-failure text. */
  const verifySignupOtp = React.useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      return await AuthService.verifySignupOtp(code);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const resendSignupOtp = React.useCallback(async () => {
    await AuthService.resendSignupOtp();
  }, []);

  const logout = React.useCallback(() => {
    void AuthService.logout().catch(() => {
      toast.error(t("signOutFailed"));
    });
  }, [t]);

  return {
    loginWithMicrosoft,
    loginWithPassword,
    loginWithSocial,
    signupWithMicrosoft,
    signupWithPassword,
    signupWithSocial,
    verifySignupOtp,
    resendSignupOtp,
    logout,
    isLoading,
  };
}
