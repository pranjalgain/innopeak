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
 * Built by a factory rather than declared at module scope: next-intl exposes translations through
 * the `useTranslations` hook, which cannot be called outside a component, so the schema is
 * constructed at render with the caller's translator. Memoize it (`useMemo`) so the resolver
 * identity is stable across renders.
 *
 * Password rules come from `password-rules.ts` — the same constants the live checklist reads.
 */
export function createAccountSchema(t: Translate) {
  return z
    .object({
      name: z.string().trim().min(1, t("errors.nameRequired")),
      businessName: z.string().trim().min(1, t("errors.businessNameRequired")),
      email: z.string().trim().email(t("errors.emailInvalid")),
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

export type CreateAccountSchema = ReturnType<typeof createAccountSchema>;

/**
 * The form's own fields, including `confirmPassword`. Distinct from `CreateAccountFormValues`
 * (the form's submit payload), which drops it — confirmation is a UI concern, not something the
 * signup call takes.
 */
export type CreateAccountFields = z.infer<CreateAccountSchema>;
