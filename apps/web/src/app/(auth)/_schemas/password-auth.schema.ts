import { z } from "zod";

/** Matches next-intl's `useTranslations` return shape. */
type Translate = (key: string) => string;

/**
 * Built by a factory since next-intl's translator is a hook; memoize the result (`useMemo`).
 * Password is checked for presence only: an existing account may predate a rule change, and calling its current
 * password invalid would block sign-in. Whether it is correct is the server's answer.
 */
export function passwordAuthSchema(t: Translate) {
  return z.object({
    email: z.string().trim().email(t("errors.emailInvalid")),
    password: z.string().min(1, t("errors.passwordRequired")),
  });
}

export type PasswordAuthSchema = ReturnType<typeof passwordAuthSchema>;
export type PasswordAuthFields = z.infer<PasswordAuthSchema>;
