import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { type AdminInvitePreview, AuthService } from "@/app/_libs/services/auth.service";
import { authErrorMessage } from "@/hooks/auth/use-auth";

interface UseAcceptAdminInviteResult {
  /** True while the token is being checked on mount — the form is not shown yet either way. */
  isValidating: boolean;
  /** The invited email, once validation succeeds. */
  invite: AdminInvitePreview | null;
  /** Set once validation fails — a dead link gets its own message, not the password form. */
  invalid: boolean;
  isSubmitting: boolean;
  /** Returns whether it succeeded — a toast is already shown on failure. */
  acceptWithPassword: (password: string) => Promise<boolean>;
  /** Navigates away — there is no return value to check. */
  startWithGoogle: () => void;
  /** Navigates away — there is no return value to check. */
  startWithMicrosoft: () => void;
}

/** Validates the token on mount (so a dead link fails before a password is typed), then offers password or Google. */
export function useAcceptAdminInvite(token: string): UseAcceptAdminInviteResult {
  const t = useTranslations("auth.toasts");
  const [isValidating, setIsValidating] = useState(true);
  const [invite, setInvite] = useState<AdminInvitePreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsValidating(true);
    setInvalid(false);

    AuthService.validateAdminInvite(token)
      .then((preview) => {
        if (!cancelled) setInvite(preview);
      })
      .catch(() => {
        if (!cancelled) setInvalid(true);
      })
      .finally(() => {
        if (!cancelled) setIsValidating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const acceptWithPassword = useCallback(
    async (password: string) => {
      setIsSubmitting(true);
      try {
        await AuthService.acceptAdminInvite(token, password);
        return true;
      } catch (error) {
        toast.error(authErrorMessage(error, t("signInFailed")));
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [token, t],
  );

  const startWithGoogle = useCallback(() => {
    AuthService.startAdminInviteGoogle(token);
  }, [token]);

  const startWithMicrosoft = useCallback(() => {
    AuthService.startAdminInviteMicrosoft(token);
  }, [token]);

  return {
    isValidating,
    invite,
    invalid,
    isSubmitting,
    acceptWithPassword,
    startWithGoogle,
    startWithMicrosoft,
  };
}
