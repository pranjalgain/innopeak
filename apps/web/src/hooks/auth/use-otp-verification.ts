import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type { VerifyOtpResult } from "@/app/_libs/services/auth.service";
import type { ResendOtpResult } from "@/hooks/auth/use-auth";

interface UseOtpVerificationParams {
  email: string;
  verifySignupOtp: (email: string, code: string) => Promise<VerifyOtpResult>;
  resendSignupOtp: (email: string) => Promise<ResendOtpResult>;
  /** Called only on a successful verify — the caller decides what "success" means for its own flow (advance a wizard step vs. navigate away). */
  onVerified: (hasConnectedBusiness: boolean) => void;
}

interface UseOtpVerificationResult {
  /** Resolves whether the code was accepted, so the screen can clear its boxes on a miss. */
  handleVerify: (code: string) => Promise<boolean>;
  handleResend: () => Promise<void>;
}

/** Shared OTP step for the signup wizard and login; the flows differ only in `onVerified` and where `isLoading` comes from. */
export function useOtpVerification({
  email,
  verifySignupOtp,
  resendSignupOtp,
  onVerified,
}: UseOtpVerificationParams): UseOtpVerificationResult {
  const tOtp = useTranslations("onboardingSignup.otp");

  const handleVerify = async (code: string): Promise<boolean> => {
    const { verified, hasConnectedBusiness, errorMessage } = await verifySignupOtp(email, code);
    if (verified) {
      onVerified(hasConnectedBusiness);
      return true;
    }
    // `errorMessage` is set only when the failure wasn't a wrong code (rate limit, network, server).
    toast.error(errorMessage ?? tOtp("toasts.verifyFailed"));
    return false;
  };

  const handleResend = async () => {
    const { sent, message } = await resendSignupOtp(email);
    if (sent) {
      toast.success(tOtp("toasts.resent"));
    } else {
      toast.error(message ?? tOtp("toasts.resendFailed"));
    }
  };

  return { handleVerify, handleResend };
}
