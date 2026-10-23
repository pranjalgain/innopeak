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

// Same password rules as the platform-admin schema plus `name` (`users.name` is NOT NULL). No `otp`: the URL token is the proof.
export function acceptMemberInviteSchema(t: Translate) {
  return z
    .object({
      name: z.string().trim().min(1, t("errors.nameRequired")),
      password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t("errors.passwordTooShort"))
        .refine(fitsPasswordLimit, t("errors.passwordTooLong"))
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

export type AcceptMemberInviteSchema = ReturnType<typeof acceptMemberInviteSchema>;
export type AcceptMemberInviteFields = z.infer<AcceptMemberInviteSchema>;
