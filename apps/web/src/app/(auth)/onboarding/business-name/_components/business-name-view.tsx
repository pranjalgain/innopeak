"use client";


import Link from "next/link";
import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";


import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import { ROUTES } from "@/app/_libs/constants/routes";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/auth/use-auth";

/**
 * Screen between the Google/Microsoft OAuth callback and /onboarding/plan: an SSO provider returns a person, not a business, and `tenants.name` is NOT NULL.
 * Reachable only via the `sso_pending_signup` cookie, so nothing is guarded client-side; a missing or used cookie makes
 * `completeSsoSignup` throw with the backend's start-over message.
 */
export function BusinessNameView() {
  const t = useTranslations("onboardingBusinessName");
  const router = useRouter();
  const { completeSsoSignup, isLoading } = useAuth();
  const [businessName, setBusinessName] = useState("");
  // Set only on submit, never blur: the input is `autoFocus`, so an incidental blur (autofill, password manager)
  // must not paint it red.
  const [submitted, setSubmitted] = useState(false);

  const trimmed = businessName.trim();
  const showRequiredError = submitted && trimmed === "";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (trimmed === "") return;

    const succeeded = await completeSsoSignup(trimmed);
    if (succeeded) {
      // Same handoff as onboarding-signup-view's SSO path (the stepper reads this). Goes to /onboarding/plan so every
      // fresh signup sees the Free/Paid choice first (see its `handOffToPlan`).
      OnboardingContextService.set({ from: "signup", via: "sso" });
      router.replace(ROUTES.ONBOARDING_PLAN);
    }
  };

  return (
    <>
      <AuthLogo />

      <div className="flex w-full max-w-[460px] flex-col items-center gap-6">
        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full rounded-xl border duration-500">
          <h1 className="mb-1 text-center text-lg font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground mb-6 text-center text-sm">{t("subtitle")}</p>

          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleSubmit(event)}
            noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onboarding-business-name">{t("label")}</Label>
              <Input
                id="onboarding-business-name"
                type="text"
                placeholder={t("placeholder")}
                autoComplete="organization"
                autoFocus
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
              />
              {showRequiredError ? (
                <p className="text-destructive text-[12.5px]">{t("errors.required")}</p>
              ) : null}
            </div>

            <Button type="submit" size="block" disabled={isLoading}>
              {isLoading ? t("submitting") : t("submit")}
            </Button>
          </form>

          <div className="text-muted-foreground mt-6 text-center text-sm">
            {t("startOver")}{" "}
            <Link href={ROUTES.ONBOARDING_SIGNUP} className="font-medium">
              {t("startOverLink")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
