import { z } from "zod";

import {
  fitsPasswordLimit,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_NUMBER_REGEX,
  PASSWORD_SPECIAL_REGEX,
  PASSWORD_UPPERCASE_REGEX,
} from "@/app/_libs/constants/password-rules";

type Translate = (key: string) => string;

/** Like `changePasswordSchema` minus `currentPassword`: an SSO-only account has none to prove. Factory + memoize for the same reason. */
const OTP_LENGTH = 6;
const OTP_PATTERN = /^\d{6}$/;

export function setPasswordSchema(t: Translate) {
  return z
    .object({
      otp: z
        .string()
        .min(1, t("errors.otpRequired"))
        .length(OTP_LENGTH, t("errors.otpInvalid"))
        .regex(OTP_PATTERN, t("errors.otpInvalid")),
      newPassword: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t("errors.passwordTooShort"))
        .refine(fitsPasswordLimit, t("errors.passwordTooLong"))
        .regex(PASSWORD_UPPERCASE_REGEX, t("errors.passwordUppercase"))
        .regex(PASSWORD_LOWERCASE_REGEX, t("errors.passwordLowercase"))
        .regex(PASSWORD_NUMBER_REGEX, t("errors.passwordNumber"))
        .regex(PASSWORD_SPECIAL_REGEX, t("errors.passwordSpecial")),
      confirmPassword: z.string().min(1, t("errors.confirmPasswordRequired")),
    })
    .refine(data => data.newPassword === data.confirmPassword, {
      message: t("passwordMismatch"),
      path: ["confirmPassword"],
    });
}

export type SetPasswordSchema = ReturnType<typeof setPasswordSchema>;
export type SetPasswordFields = z.infer<SetPasswordSchema>;
