import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { LuSave, LuUserRound } from "react-icons/lu";
import { toast } from "sonner";

import { PANEL_CLASS, PanelHeading } from "@/app/(dashboard)/settings/_components/billing-panel";
import { FIELD_ERROR_CLASS } from "@/app/(dashboard)/settings/_components/field-error";
import {
  type BillingProfileFields,
  billingProfileSchema,
} from "@/app/(dashboard)/settings/_schemas/billing-profile.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingProfile } from "@/hooks/billing/use-billing-profile";
import { useUpdateBillingProfile } from "@/hooks/billing/use-update-billing-profile";

export function BillingProfileForm() {
  const t = useTranslations("settings.billing.manageDialog.profile");
  const schema = useMemo(() => billingProfileSchema(t), [t]);
  const { data: profile, isLoading } = useBillingProfile(true);
  const updateMutation = useUpdateBillingProfile();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid, isSubmitting, isDirty },
  } = useForm<BillingProfileFields>({
    resolver: zodResolver(schema),
    // `onChange`, not `onTouched` (unlike the fresh-empty-fields password forms elsewhere in
    // Settings): this form's fields start pre-filled by `reset()` below, from server data the
    // tenant never typed — so "touched" alone would never include an untouched-but-already-valid
    // field, and `isValid` would stay stale if the tenant only edits one of the two fields.
    mode: "onChange",
    defaultValues: { name: "", email: "" },
  });

  // Populates the form once the profile loads — `defaultValues` above can't know it yet, since
  // this data arrives asynchronously after the form is already mounted.
  useEffect(() => {
    if (profile) reset({ name: profile.name ?? "", email: profile.email ?? "" });
  }, [profile, reset]);

  const submit = handleSubmit(async (values) => {
    await updateMutation.mutateAsync(values, {
      onSuccess: () => toast.success(t("saved")),
      onError: () => toast.error(t("saveFailed")),
    });
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;

  return (
    <form onSubmit={submit} className={PANEL_CLASS} noValidate>
      <PanelHeading icon={LuUserRound}>{t("title")}</PanelHeading>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="billing-profile-name">{t("nameLabel")}</Label>
          <Input id="billing-profile-name" {...register("name")} />
          {errors.name ? <p className={FIELD_ERROR_CLASS}>{errors.name.message}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="billing-profile-email">{t("emailLabel")}</Label>
          <Input id="billing-profile-email" type="email" {...register("email")} />
          {errors.email ? <p className={FIELD_ERROR_CLASS}>{errors.email.message}</p> : null}
        </div>
      </div>

      <Button type="submit" className="w-fit" disabled={!isValid || !isDirty || isSubmitting}>
        <LuSave />
        {isSubmitting ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
