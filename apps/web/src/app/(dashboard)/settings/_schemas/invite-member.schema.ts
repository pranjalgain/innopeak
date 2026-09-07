import { z } from "zod";

/** Resolves one error-message key. Matches next-intl's `useTranslations` return shape. */
type Translate = (key: string) => string;

/**
 * The tenant's "invite a teammate" field. A factory because next-intl's translator is a hook —
 * memoize the result (`useMemo`).
 *
 * Kept separate from the platform-admin invite schema despite the identical rule: the two live in
 * different route groups and their messages address different audiences.
 */
export function inviteMemberSchema(t: Translate) {
  return z.object({
    email: z.string().trim().email(t("errors.emailInvalid")),
  });
}

export type InviteMemberFields = z.infer<ReturnType<typeof inviteMemberSchema>>;
