"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { AuthDivider } from "@/app/(auth)/_components/auth-divider";
import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { SocialAuthButtons } from "@/app/(auth)/_components/social-auth-buttons";
import {
  type AcceptMemberInviteFields,
  acceptMemberInviteSchema,
} from "@/app/(auth)/accept-invite/[token]/_schemas/accept-invite.schema";
import { ROUTES } from "@/app/_libs/constants/routes";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcceptMemberInvite } from "@/hooks/auth/use-accept-member-invite";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

const FIELD_ERROR_CLASS = "text-[12.5px] text-destructive";

const CARD_CLASS =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full max-w-[420px] rounded-xl border duration-500";

interface AcceptInviteViewProps {
  token: string;
}

/**
 * Tenant-member invite acceptance — the mirror of the platform-admin `AcceptInviteView`
 * (`(auth)/invite/[token]`), with one real difference: `users.name` is `NOT NULL` and the
 * invite-send form is email-only, so this screen also collects the invitee's own name (admin's
 * doesn't — `platform_admins` has no `name` column at all). Four states: validating the token
 * (skeleton), invalid/expired (a dead end back to `/login`), a transient validation failure (a
 * retry button — see `useAcceptMemberInvite`'s own comment for why this is not the same as
 * invalid), or the two ways to finish — a name + password, or Google.
 *
 * On success, routes exactly like `LoginView` does: the dashboard if this tenant already has a
 * connected Google Business Profile, the connect stepper otherwise. A member joining an existing
 * business almost always lands on the dashboard — the stepper only fires for the rare case of
 * accepting before the owner has connected anything yet.
 */
export function AcceptInviteView({ token }: AcceptInviteViewProps) {
  const t = useTranslations("auth.acceptMemberInvite");
  useOAuthErrorToast();
  const router = useRouter();
  const {
    isValidating,
    invite,
    invalid,
    isSubmitting,
    acceptWithPassword,
    startWithGoogle,
    retryValidation,
  } = useAcceptMemberInvite(token);

  // Gated exactly like the tenant `LoginView`'s own Google button — `socialLoginEnabled` decides
  // whether the button renders, not whether the invite itself is valid.
  const { data: platformSettings } = usePlatformSettings();
  const socialEnabled = platformSettings?.socialLoginEnabled ?? false;

  const schema = useMemo(() => acceptMemberInviteSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, touchedFields },
  } = useForm<AcceptMemberInviteFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { name: "", password: "", confirmPassword: "" },
  });

  const [passwordValue, setPasswordValue] = useState("");
  const requirements = checkPasswordRequirements(passwordValue);
  const showRequirements =
    Boolean(touchedFields.password) && passwordValue.length > 0 && !passwordMeetsRequirements(requirements);

  const submit = handleSubmit(async (values) => {
    const { succeeded, hasConnectedBusiness } = await acceptWithPassword(
      values.name,
      values.password,
    );
    if (succeeded) {
      router.push(hasConnectedBusiness ? ROUTES.DASHBOARD : ROUTES.ONBOARDING_CONNECT);
    }
  });

  if (isValidating) {
    return (
      <>
        <AuthLogo />
        <div className={CARD_CLASS}>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </>
    );
  }

  if (invalid) {
    return (
      <>
        <AuthLogo />
        <div className={CARD_CLASS}>
          <h1 className="text-gradient mb-2 text-center text-xl font-semibold">
            {t("invalidTitle")}
          </h1>
          <p className="text-muted-foreground mb-6 text-center text-sm">
            {t("invalidDescription")}
          </p>
          <Button asChild variant="outline" size="block">
            <Link href={ROUTES.LOGIN}>{t("backToLogin")}</Link>
          </Button>
        </div>
      </>
    );
  }

  // Distinct from `invalid`: a network drop, a 5xx, or the validate route's own rate limit failed
  // the check without ever telling us the token itself is dead — unlike `invalid`, this can
  // resolve by simply asking again, so it gets a retry button rather than a hard dead end.
  if (!invite) {
    return (
      <>
        <AuthLogo />
        <div className={CARD_CLASS}>
          <h1 className="text-gradient mb-2 text-center text-xl font-semibold">
            {t("unavailableTitle")}
          </h1>
          <p className="text-muted-foreground mb-6 text-center text-sm">
            {t("unavailableDescription")}
          </p>
          <Button variant="outline" size="block" onClick={retryValidation}>
            {t("retry")}
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthLogo />
      <div className={CARD_CLASS}>
        <h1 className="text-gradient mb-1 text-center text-xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mb-7 text-center text-sm">
          {socialEnabled
            ? t("invitedAsWithGoogle", { email: invite.email })
            : t("invitedAs", { email: invite.email })}
        </p>

        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-name">{t("nameLabel")}</Label>
            <Input id="invite-name" autoComplete="name" {...register("name")} />
            {errors.name ? <p className={FIELD_ERROR_CLASS}>{errors.name.message}</p> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-password">{t("passwordLabel")}</Label>
            <PasswordInput
              id="invite-password"
              autoComplete="new-password"
              {...register("password", {
                onChange: (event) => setPasswordValue(event.target.value),
              })}
            />
            {showRequirements ? (
              <PasswordRequirementsList requirements={requirements} />
            ) : errors.password ? (
              // The checklist covers every rule it tracks (length, case, digit, special
              // character) — this only ever renders for a rule it doesn't, `PASSWORD_MAX_LENGTH`,
              // where the checklist would otherwise show all-green while the form stays invalid
              // with no visible reason why.
              <p className={FIELD_ERROR_CLASS}>{errors.password.message}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-confirm-password">{t("confirmPasswordLabel")}</Label>
            <PasswordInput
              id="invite-confirm-password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className={FIELD_ERROR_CLASS}>{errors.confirmPassword.message}</p>
            ) : null}
          </div>

          <Button type="submit" variant="outline" size="block" disabled={!isValid || isSubmitting}>
            {isSubmitting ? t("submitting") : t("submit")}
          </Button>
        </form>

        {socialEnabled ? (
          <>
            <AuthDivider label={t("orDivider")} />

            <SocialAuthButtons
              isLoading={isSubmitting}
              onGoogleClick={startWithGoogle}
              label={t("continueWithGoogle")}
            />
          </>
        ) : null}
      </div>
    </>
  );
}
