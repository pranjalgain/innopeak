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
  type AcceptInviteFields,
  acceptInviteSchema,
} from "@/app/(auth)/invite/[token]/_schemas/accept-invite.schema";
import { ROUTES } from "@/app/_libs/constants/routes";
import { PasswordInput } from "@/components/common/password-input";
import {
  checkPasswordRequirements,
  passwordMeetsRequirements,
  PasswordRequirementsList,
} from "@/components/common/password-requirements-list";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAcceptAdminInvite } from "@/hooks/auth/use-accept-admin-invite";
import { useOAuthErrorToast } from "@/hooks/auth/use-oauth-error-toast";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

const FIELD_ERROR_CLASS = "text-[12.5px] text-destructive";

const CARD_CLASS =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full max-w-[420px] rounded-xl border duration-500";

interface AcceptInviteViewProps {
  token: string;
}

/**
 * Platform-admin invite acceptance. Same card shell `LoginView` uses, in three states: validating
 * the token (skeleton), invalid/expired (a dead end back to login — there is nothing else this
 * screen can do with a bad token), or the two ways to finish — a password, or Google (which
 * navigates away entirely and comes back here with `?error=` on failure, read by
 * `useOAuthErrorToast` the same way the login screen reads its own Google failures).
 */
export function AcceptInviteView({ token }: AcceptInviteViewProps) {
  const t = useTranslations("auth.acceptInvite");
  useOAuthErrorToast();
  const router = useRouter();
  const { isValidating, invite, invalid, isSubmitting, acceptWithPassword, startWithGoogle } =
    useAcceptAdminInvite(token);

  // Gated exactly like `LoginView`'s own Google button, and for a load-bearing reason rather than
  // symmetry: an admin who accepts through Google gets no `password_hash` at all, so Google
  // becomes their *only* credential. Offering it here while the platform has social sign-in
  // switched off would mint an admin whose one way in is a button `/login` doesn't render —
  // locked out on arrival, with no admin equivalent of the tenant `set-password` flow to recover
  // through. Defaults to hidden while the fetch is in flight (and on failure), same as the login
  // screen: the password form below is always available, so hiding it costs nothing.
  const { data: platformSettings } = usePlatformSettings();
  const socialEnabled = platformSettings?.socialLoginEnabled ?? false;

  const schema = useMemo(() => acceptInviteSchema(t), [t]);
  const {
    register,
    handleSubmit,
    formState: { errors, isValid, touchedFields },
  } = useForm<AcceptInviteFields>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { password: "", confirmPassword: "" },
  });

  const [passwordValue, setPasswordValue] = useState("");
  const requirements = checkPasswordRequirements(passwordValue);
  const showRequirements =
    Boolean(touchedFields.password) && passwordValue.length > 0 && !passwordMeetsRequirements(requirements);

  const submit = handleSubmit(async (values) => {
    const succeeded = await acceptWithPassword(values.password);
    if (succeeded) router.push(ROUTES.ADMIN);
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

  return (
    <>
      <AuthLogo />
      <div className={CARD_CLASS}>
        <h1 className="text-gradient mb-1 text-center text-xl font-semibold">{t("title")}</h1>
        {/* Two variants rather than one neutral line: the subtitle is the only instruction on this
            screen, and naming just the password half while a Google button sits below it leaves an
            SSO invitee to infer the instruction doesn't apply to them. */}
        <p className="text-muted-foreground mb-7 text-center text-sm">
          {socialEnabled
            ? t("invitedAsWithGoogle", { email: invite?.email ?? "" })
            : t("invitedAs", { email: invite?.email ?? "" })}
        </p>

        <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-password">{t("passwordLabel")}</Label>
            <PasswordInput
              id="invite-password"
              autoComplete="new-password"
              {...register("password", {
                onChange: (event) => setPasswordValue(event.target.value),
              })}
            />
            {showRequirements ? <PasswordRequirementsList requirements={requirements} /> : null}
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
