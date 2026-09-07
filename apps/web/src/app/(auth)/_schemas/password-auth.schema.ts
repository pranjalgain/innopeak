import { z } from "zod";

/** Resolves one error-message key. Matches next-intl's `useTranslations` return shape. */
type Translate = (key: string) => string;

/**
 * Login's email/password pair. Built by a factory for the same reason as the other schemas here:
 * next-intl's translator is a hook. Memoize the result (`useMemo`).
 *
 * Password is checked for presence only — never against the signup rules. An existing account may
 * predate a rule change, and telling someone their *current* password is "invalid" on the sign-in
 * screen would block them from the account they legitimately hold. Whether it is correct is the
 * server's answer.
 */
export function passwordAuthSchema(t: Translate) {
  return z.object({
    email: z.string().trim().email(t("errors.emailInvalid")),
    password: z.string().min(1, t("errors.passwordRequired")),
  });
}

export type PasswordAuthSchema = ReturnType<typeof passwordAuthSchema>;
export type PasswordAuthFields = z.infer<PasswordAuthSchema>;
