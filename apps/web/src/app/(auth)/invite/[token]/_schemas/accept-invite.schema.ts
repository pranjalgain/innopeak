import { z } from "zod";

import {
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_NUMBER_REGEX,
  PASSWORD_SPECIAL_REGEX,
  PASSWORD_UPPERCASE_REGEX,
} from "@/app/_libs/constants/password-rules";

/** Resolves one error-message key. Matches next-intl's `useTranslations` return shape. */
type Translate = (key: string) => string;

/**
 * Same password rules as `setPasswordSchema` (Settings → Profile's "Add password") — no `otp`
 * field here, since the invite token in the URL is itself the proof, the same way a signup's
 * emailed link stands in for a password on that flow. A factory for the same reason: built at
 * render with the caller's translator, memoized (`useMemo`) to keep the resolver identity stable.
 */
export function acceptInviteSchema(t: Translate) {
  return z
    .object({
      password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t("errors.passwordTooShort"))
        .max(PASSWORD_MAX_LENGTH, t("errors.passwordTooLong"))
        .regex(PASSWORD_UPPERCASE_REGEX, t("errors.passwordUppercase"))
        .regex(PASSWORD_LOWERCASE_REGEX, t("errors.passwordLowercase"))
        .regex(PASSWORD_NUMBER_REGEX, t("errors.passwordNumber"))
        .regex(PASSWORD_SPECIAL_REGEX, t("errors.passwordSpecial")),
      confirmPassword: z.string().min(1, t("errors.confirmPasswordRequired")),
    })
    .refine(data => data.password === data.confirmPassword, {
      message: t("passwordMismatch"),
      path: ["confirmPassword"],
    });
}

export type AcceptInviteSchema = ReturnType<typeof acceptInviteSchema>;
export type AcceptInviteFields = z.infer<AcceptInviteSchema>;
