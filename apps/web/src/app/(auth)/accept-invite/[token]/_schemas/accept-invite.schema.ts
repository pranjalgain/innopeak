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
 * Same password rules as the platform-admin accept screen's own schema, plus `name` — unlike
 * that flow, `users.name` is `NOT NULL` and the invite-send form is email-only, so the invitee
 * supplies their own name here (same rule `createAccountSchema` uses for tenant signup). No `otp`
 * field: the invite token in the URL is itself the proof.
 */
export function acceptMemberInviteSchema(t: Translate) {
  return z
    .object({
      name: z.string().trim().min(1, t("errors.nameRequired")),
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

export type AcceptMemberInviteSchema = ReturnType<typeof acceptMemberInviteSchema>;
export type AcceptMemberInviteFields = z.infer<AcceptMemberInviteSchema>;
