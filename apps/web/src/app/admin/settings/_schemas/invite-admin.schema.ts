import { z } from "zod";

/** Resolves one error-message key. Matches next-intl's `useTranslations` return shape. */
type Translate = (key: string) => string;

/** The platform-admin invite field. Factory-built because next-intl's translator is a hook. */
export function inviteAdminSchema(t: Translate) {
  return z.object({
    email: z.string().trim().email(t("errors.emailInvalid")),
  });
}

export type InviteAdminFields = z.infer<ReturnType<typeof inviteAdminSchema>>;
