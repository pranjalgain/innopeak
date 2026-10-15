import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { AuthService } from "@/app/_libs/services/auth.service";
import { authErrorMessage } from "@/hooks/auth/use-auth";

interface UseAdminLoginResult {
  /** Returns whether it succeeded — a toast is already shown on failure. */
  loginAsAdmin: (email: string, password: string) => Promise<boolean>;
  /** Navigates away — there is no return value to check. */
  startAdminGoogleLogin: () => void;
  /** Navigates away too; sign-in only, since admins are invite-only. */
  startAdminMicrosoftLogin: () => void;
  isLoading: boolean;
}

/** Platform-admin login via `AuthService.loginAsAdmin`; mirrors `useAuth` without the tenant-only branches. */
export function useAdminLogin(): UseAdminLoginResult {
  const t = useTranslations("auth.toasts");
  const [isLoading, setIsLoading] = useState(false);

  // Same bfcache hazard as `useAuth`: Google and Microsoft login navigate away, so browser-back can restore this
  // page with `isLoading: true` and no remount to clear it.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setIsLoading(false);
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const loginAsAdmin = useCallback(
    async (email: string, password: string) => {
      setIsLoading(true);
      try {
        await AuthService.loginAsAdmin(email, password);
        return true;
      } catch (error) {
        toast.error(authErrorMessage(error, t("signInFailed")));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [t],
  );

  /**
   * Navigates away, so there is no `finally` to clear the spinner. Failures return as `?error=` on
   * `/admin-login`, read on mount via `useOAuthErrorToast`.
   */
  const startAdminGoogleLogin = useCallback(() => {
    setIsLoading(true);
    AuthService.startAdminGoogleLogin();
  }, []);

  const startAdminMicrosoftLogin = useCallback(() => {
    setIsLoading(true);
    AuthService.startAdminMicrosoftLogin();
  }, []);

  return { loginAsAdmin, startAdminGoogleLogin, startAdminMicrosoftLogin, isLoading };
}
