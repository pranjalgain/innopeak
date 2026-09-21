import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { toast } from "sonner";

import { AuthService } from "@/app/_libs/services/auth.service";
import { authErrorMessage } from "@/hooks/auth/use-auth";

interface UseAdminLoginResult {
  /** Returns whether it succeeded — a toast is already shown on failure. */
  loginAsAdmin: (email: string, password: string) => Promise<boolean>;
  /** Navigates away — there is no return value to check. */
  startAdminGoogleLogin: () => void;
  isLoading: boolean;
}

/**
 * Platform-admin login, against `AuthService.loginAsAdmin` — its own route, own hook, mirroring
 * `useAuth`'s shape but without any of the tenant-only branches (`verify_needed`,
 * `hasConnectedBusiness`) that never apply to an admin. See `separate-admin-login-design.md`.
 */
export function useAdminLogin(): UseAdminLoginResult {
  const t = useTranslations("auth.toasts");
  const [isLoading, setIsLoading] = useState(false);

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
   * Navigates away rather than awaiting anything, so there is no success path and no `finally` to
   * clear the spinner — the page is being replaced. Failures come back as `?error=` on
   * `/admin-login`, which the view reads on mount via `useOAuthErrorToast`.
   */
  const startAdminGoogleLogin = useCallback(() => {
    setIsLoading(true);
    AuthService.startAdminGoogleLogin();
  }, []);

  return { loginAsAdmin, startAdminGoogleLogin, isLoading };
}
