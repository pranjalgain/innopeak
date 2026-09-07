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
 * A factory, not a module-scope schema: next-intl's `useTranslations` is a hook, so the schema is
 * built at render with the caller's translator. Memoize it (`useMemo`) to keep the resolver
 * identity stable.
 *
 * `currentPassword` is only checked for presence — whether it is *correct* is the server's answer,
 * and guessing at it client-side would be a second source of truth for something we cannot know.
 */
export function changePasswordSchema(t: Translate) {
  return z
    .object({
      currentPassword: z.string().min(1, t("errors.currentPasswordRequired")),
      newPassword: z
        .string()
        .min(PASSWORD_MIN_LENGTH, t("errors.passwordTooShort"))
        .max(PASSWORD_MAX_LENGTH, t("errors.passwordTooLong"))
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

export type ChangePasswordSchema = ReturnType<typeof changePasswordSchema>;
export type ChangePasswordFields = z.infer<ChangePasswordSchema>;
