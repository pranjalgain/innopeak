import { z } from "zod";

import {
  fitsPasswordLimit,
  PASSWORD_LOWERCASE_REGEX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_NUMBER_REGEX,
  PASSWORD_SPECIAL_REGEX,
  PASSWORD_UPPERCASE_REGEX,
} from "@/app/_libs/constants/password-rules";

/** Matches next-intl's `useTranslations` return shape. */
type Translate = (key: string) => string;

/**
 * Built by a factory because next-intl translations come from a hook, so the schema is built at render with the
 * caller's translator; memoize (`useMemo`) for a stable resolver identity. Password rules are shared with the
 * live checklist (`password-rules.ts`).
 */
export function createAccountSchema(t: Translate) {
  return z
    .object({
      name: z.string().trim().min(1, t("errors.nameRequired")).max(255, t("errors.nameTooLong")),
      businessName: z
        .string()
        .trim()
        .min(1, t("errors.businessNameRequired"))
        .max(255, t("errors.nameTooLong")),
      email: z.string().trim().email(t("errors.emailInvalid")),
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

export type CreateAccountSchema = ReturnType<typeof createAccountSchema>;

/** The form's fields including `confirmPassword`, which `CreateAccountFormValues` (the submit payload) drops: confirmation is UI-only. */
export type CreateAccountFields = z.infer<CreateAccountSchema>;
