import { z } from "zod";

type Translate = (key: string) => string;

/** A factory because next-intl's translator is a hook; memoize. Kept apart from the platform-admin invite schema: different route groups and audiences. */
export function inviteMemberSchema(t: Translate) {
  return z.object({
    email: z.string().trim().email(t("errors.emailInvalid")),
  });
}

export type InviteMemberFields = z.infer<ReturnType<typeof inviteMemberSchema>>;
