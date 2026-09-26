import { z } from "zod";

/** Resolves one error-message key. Matches next-intl's `useTranslations` return shape. */
type Translate = (key: string) => string;

/** A factory, not a module-scope schema — see `change-password.schema.ts`'s own comment for why. */
export function billingProfileSchema(t: Translate) {
  return z.object({
    name: z.string().trim().min(1, t("errors.nameRequired")).max(255, t("errors.nameTooLong")),
    email: z.string().trim().email(t("errors.emailInvalid")).max(255, t("errors.emailTooLong")),
  });
}

export type BillingProfileSchema = ReturnType<typeof billingProfileSchema>;
export type BillingProfileFields = z.infer<BillingProfileSchema>;
