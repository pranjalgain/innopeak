"use client";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { LuCheck, LuLoaderCircle } from "react-icons/lu";

import { AuthLogo } from "@/app/(auth)/_components/auth-logo";
import type { OnboardingStep } from "@/app/(auth)/onboarding/_components/onboarding-step.types";
import { OnboardingStepper } from "@/app/(auth)/onboarding/_components/onboarding-stepper";
import { ROUTES } from "@/app/_libs/constants/routes";
import {
  type OnboardingContext,
  OnboardingContextService,
} from "@/app/_libs/services/onboarding-context.service";
import { LoadErrorState } from "@/components/common/load-error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingPlans } from "@/hooks/billing/use-billing-plans";
import { useCreateCheckoutSession } from "@/hooks/billing/use-create-checkout-session";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";
import type { BillingPlan } from "@/types/domain";

const PASSWORD_STEPS: OnboardingStep[] = ["identity", "otp", "plan", "connect"];
const SSO_LIKE_STEPS: OnboardingStep[] = ["identity", "plan", "connect"];

interface PlanCardProps {
  name: string;
  description: string;
  features: string[];
  action: ReactNode;
  highlighted?: boolean;
}

function PlanCard({ name, description, features, action, highlighted = false }: PlanCardProps) {
  return (
    <Card className={highlighted ? "border-primary shadow-elevated" : undefined}>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-[13px]">
              <LuCheck className="text-primary mt-0.5 size-4 shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
        {action}
      </CardContent>
    </Card>
  );
}

/**
 * Step 3 of onboarding, between signup/business-name and /onboarding/connect — see
 * `onboarding-signup-view.tsx`'s `handOffToPlan` for why this exists: a fresh tenant sees the
 * Free/Paid choice before ever reaching the location-picker, instead of discovering the Free
 * 1-location cap as a rejection after trying to connect several (that rejection is still correctly
 * enforced server-side either way — see `ConnectionsDbService.confirmLocations` — this step only
 * makes the cap known up front instead of as a surprise).
 *
 * "Continue with Free" is a real, explicit button, not a skip link — the tenant is already on
 * Free from signup (`AuthDbService.signup` seeds it), so this makes no backend call, it just moves
 * on. "Upgrade to Paid" reuses the exact same `useCreateCheckoutSession` the Settings > Billing tab
 * uses, redirecting the whole page to Stripe/Dummy Checkout; on return, `ConnectionGuard` (this
 * tenant has no connection yet) bounces straight to /onboarding/connect, already on Paid.
 *
 * Only rendered for a genuinely fresh signup (see the two `handOffToPlan`-equivalent call sites) —
 * a returning owner who never finished connecting, or a member accepting an invite, goes straight
 * to /onboarding/connect as before; they've already had, or never needed, this choice.
 */
export function OnboardingPlanView() {
  const t = useTranslations("onboardingPlan");
  const router = useRouter();
  const [context, setContext] = useState<OnboardingContext | null>(null);

  // Read in an effect, not during render: sessionStorage does not exist on the server, and
  // reading it inline would make the first client render disagree with the server's HTML.
  useEffect(() => {
    setContext(OnboardingContextService.get());
  }, []);

  const {
    data: platformSettings,
    isLoading: platformSettingsLoading,
    isError: platformSettingsError,
    refetch: refetchPlatformSettings,
  } = usePlatformSettings();
  const {
    data: plansResult,
    isLoading: plansLoading,
    isError: plansError,
    refetch: refetchPlans,
  } = useBillingPlans();
  const { mutate: createCheckoutSession, isPending: isRedirecting } = useCreateCheckoutSession();

  const handleContinueFree = () => {
    router.push(ROUTES.ONBOARDING_CONNECT);
  };

  const planFeatures = (plan: BillingPlan): string[] => [
    plan.maxLocations === null
      ? t("features.locationsUnlimited")
      : t("features.locations", { count: plan.maxLocations }),
    plan.maxAiDraftsPerMonth === null
      ? t("features.aiDraftsUnlimited")
      : t("features.aiDrafts", { count: plan.maxAiDraftsPerMonth }),
    plan.maxTeamMembers === null
      ? t("features.teamMembersUnlimited")
      : t("features.teamMembers", { count: plan.maxTeamMembers }),
    plan.customPromptsEnabled ? t("features.customPromptsOn") : t("features.customPromptsOff"),
  ];

  const isLoading = platformSettingsLoading || plansLoading;
  const isError = platformSettingsError || plansError;
  const paymentFeatureEnabled = platformSettings?.paymentFeatureEnabled === true;
  const freePlan = plansResult?.plans.find((plan) => plan.code === "free");
  const paidPlan = plansResult?.plans.find((plan) => plan.code === "paid");
  const showPaidCard = paymentFeatureEnabled && Boolean(paidPlan);

  return (
    <>
      <AuthLogo />

      <div className="flex w-full max-w-[720px] flex-col items-center gap-6">
        {context ? (
          <OnboardingStepper
            steps={context.via === "password" ? PASSWORD_STEPS : SSO_LIKE_STEPS}
            currentStep="plan"
          />
        ) : null}

        <div className="animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards p-fluid-page border-border bg-card shadow-elevated ease-fluid w-full rounded-xl border duration-500">
          <h1 className="mb-1 text-center text-lg font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground mb-6 text-center text-sm">{t("subtitle")}</p>

          {isError ? (
            <LoadErrorState
              onRetry={() => {
                void refetchPlatformSettings();
                void refetchPlans();
              }}
            />
          ) : isLoading || !freePlan ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : (
            <div
              className={
                showPaidCard
                  ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
                  : "flex justify-center"
              }
            >
              <div className={showPaidCard ? undefined : "w-full max-w-sm"}>
                <PlanCard
                  name={t("free.name")}
                  description={t("free.description")}
                  features={planFeatures(freePlan)}
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="block"
                      onClick={handleContinueFree}>
                      {t("free.continue")}
                    </Button>
                  }
                />
              </div>

              {showPaidCard && paidPlan ? (
                <PlanCard
                  name={t("paid.name")}
                  description={t("paid.description")}
                  features={planFeatures(paidPlan)}
                  highlighted
                  action={
                    <Button
                      type="button"
                      size="block"
                      disabled={isRedirecting}
                      onClick={() => createCheckoutSession()}>
                      {isRedirecting ? (
                        <LuLoaderCircle className="size-4 animate-spin" />
                      ) : (
                        t("paid.upgrade")
                      )}
                    </Button>
                  }
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
