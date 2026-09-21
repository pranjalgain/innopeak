import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { ApiError } from "@/app/_libs/services/api-error";
import { AuthService, type MemberInvitePreview } from "@/app/_libs/services/auth.service";
import { authErrorMessage } from "@/hooks/auth/use-auth";

interface UseAcceptMemberInviteResult {
  /** True while the token is being checked on mount — the form is not shown yet either way. */
  isValidating: boolean;
  /** The invited email, once validation succeeds. */
  invite: MemberInvitePreview | null;
  /** Set once validation fails — a dead link gets its own message, not the name/password form. */
  invalid: boolean;
  isSubmitting: boolean;
  /** Returns whether it succeeded, and whether this tenant has a connected Google Business
   *  Profile already — the view needs the latter to route to the dashboard or the connect
   *  stepper, same as `useAuth().loginWithPassword`. A toast is already shown on failure. */
  acceptWithPassword: (
    name: string,
    password: string,
  ) => Promise<{ succeeded: boolean; hasConnectedBusiness: boolean }>;
  /** Navigates away — there is no return value to check. */
  startWithGoogle: () => void;
  /** Re-runs validation — the way out of a transient failure (a network drop, a 5xx, the
   *  validate route's own rate limit), which is not the same as `invalid` and must not be. */
  retryValidation: () => void;
}

/**
 * Tenant-member invite acceptance — validates the token on mount (so a dead link fails before
 * the invitee ever types anything), then offers the two ways to finish: a name + password, or
 * Google. Wraps `AuthService` the same way `useAcceptAdminInvite` does, so the accept page never
 * calls it directly.
 */
export function useAcceptMemberInvite(token: string): UseAcceptMemberInviteResult {
  const t = useTranslations("auth.toasts");
  const t2 = useTranslations("auth.acceptMemberInvite.errors");
  const [isValidating, setIsValidating] = useState(true);
  const [invite, setInvite] = useState<MemberInvitePreview | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsValidating(true);
    setInvalid(false);

    AuthService.validateMemberInvite(token)
      .then((preview) => {
        if (!cancelled) setInvite(preview);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Only a 404 means the invite itself is dead — the dead-end screen this sets is a hard
        // stop with no retry, so a network drop, a 5xx, or the validate route's own rate limit
        // (429) must not land there too. Those show a toast instead and leave the loading state,
        // so a refresh can succeed once the transient condition clears.
        if (error instanceof ApiError && error.statusCode === 404) {
          setInvalid(true);
        } else {
          toast.error(authErrorMessage(error, t2("validationFailed")));
        }
      })
      .finally(() => {
        if (!cancelled) setIsValidating(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, retryKey]);

  const retryValidation = useCallback(() => setRetryKey((key) => key + 1), []);

  const acceptWithPassword = useCallback(
    async (name: string, password: string) => {
      setIsSubmitting(true);
      try {
        const result = await AuthService.acceptMemberInvite(token, name, password);
        return { succeeded: true, hasConnectedBusiness: result.hasConnectedBusiness };
      } catch (error) {
        toast.error(authErrorMessage(error, t("signInFailed")));
        return { succeeded: false, hasConnectedBusiness: false };
      } finally {
        setIsSubmitting(false);
      }
    },
    [token, t],
  );

  const startWithGoogle = useCallback(() => {
    AuthService.startMemberInviteGoogle(token);
  }, [token]);

  return {
    isValidating,
    invite,
    invalid,
    isSubmitting,
    acceptWithPassword,
    startWithGoogle,
    retryValidation,
  };
}
