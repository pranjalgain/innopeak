"use client";


import type { Route } from "next";
import { useRouter } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef } from "react";
import { LuTriangleAlert } from "react-icons/lu";


import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { BillingService } from "@/app/_libs/services/billing.service";
import { OnboardingContextService } from "@/app/_libs/services/onboarding-context.service";
import { Button } from "@/components/ui/button";
import { subscriptionQueryKey } from "@/hooks/billing/use-subscription";
import { useConnection } from "@/hooks/connections/use-connection";
import { useConnectionAuthorize } from "@/hooks/connections/use-connection-authorize";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

/**
 * Where a disconnected owner is sent. Returning from Stripe lands on /settings, which this guard bounces; the checkout
 * outcome in the URL decides the destination, otherwise a fresh signup who backed out of checkout would reach the connect
 * screen on Free without ever having chosen Free. Outside a signup wizard (no context) the outcome changes nothing.
 *
 * A completed checkout is reconciled with Stripe here: this guard keeps /settings (which normally does it) from ever rendering,
 * and without it the plan still reads Free until the webhook lands, so a paying customer would be offered Free's one location.
 */
async function disconnectedDestination(search: string): Promise<string> {
  const params = new URLSearchParams(search);
  const checkout = params.get("checkout");
  if (checkout === "success") {
    OnboardingContextService.setPlan("paid");
    const sessionId = params.get("session_id");
    if (sessionId) {
      // The webhook is still the primary path; a failed reconcile must not block the user.
      await BillingService.reconcileCheckoutSession(sessionId).catch(() => undefined);
    }
  } else if (checkout === "cancel" && OnboardingContextService.get()) {
    OnboardingContextService.clearPlan();
    return `${ROUTES.ONBOARDING_PLAN}?checkout=cancel`;
  }
  return ROUTES.ONBOARDING_CONNECT;
}

interface ConnectionGuardProps {
  children: ReactNode;
}

/**
 * Gates the dashboard on a connected Google Business Profile. Deliberate behaviours:
 *  - `needs_reauth` still renders the app (with a banner): blanking the dashboard reads as data
 *    loss when only ingestion of new reviews is broken.
 *  - A network/5xx failure fails open: ejecting a signed-in user to onboarding over a timeout is
 *    worse. A 401 is handled upstream (`ApiClient` + `RequireAuth`), so this cannot mask it.
 *  - A 403 does not fail open: it means a non-tenant token (e.g. a platform admin) reached the
 *    dashboard, retrying can never succeed, and failing open would hide a permanent access problem.
 *  - A `member` never reaches the connect stepper: every route it drives is owner-only, so its
 *    only button would 403 with nowhere else to navigate. They get `WaitingOnOwnerScreen`.
 */
export function ConnectionGuard({ children }: ConnectionGuardProps) {
  const { state, isLoading, error } = useConnection();
  // The redirect-vs-explain decision must wait for this: `isMember` is false while `profile` loads, which would briefly send a member to the stepper.
  const { profile, isLoading: isProfileLoading } = useTenantOwnerProfile();
  const isMember = profile?.role === "member";
  const router = useRouter();
  const queryClient = useQueryClient();
  // One destination per mount, however often the effect re-runs (StrictMode, dependency changes): the work behind it reconciles
  // with Stripe and edits the wizard context, neither of which should happen twice.
  const destinationRef = useRef<Promise<string> | null>(null);

  const isForbidden = error instanceof ApiError && error.statusCode === 403;
  const isDisconnected = !isLoading && !error && state?.status === "disconnected";
  const shouldRedirect = isDisconnected && !isProfileLoading && !isMember;
  const shouldExplainToMember = isDisconnected && !isProfileLoading && isMember;

  useEffect(() => {
    if (shouldRedirect) {
      // Dropped if this run is cleaned up first, so a slow reconcile can't yank someone who has since moved on.
      let isCurrent = true;
      destinationRef.current ??= disconnectedDestination(window.location.search);
      void destinationRef.current.then((destination) => {
        if (!isCurrent) return;
        void queryClient.invalidateQueries({ queryKey: subscriptionQueryKey });
        router.replace(destination as Route);
      });
      return () => {
        isCurrent = false;
      };
    }
    // Hard redirect, not router.replace(): /login would bounce a signed-in visitor straight back into this same rejection.
    if (isForbidden) window.location.href = ROUTES.FORBIDDEN;
    return undefined;
  }, [shouldRedirect, isForbidden, router, queryClient]);

  if (isLoading || (isDisconnected && isProfileLoading)) return <ShellSkeleton />;

  // A skeleton, not nothing: returning from checkout waits on a Stripe reconcile before the redirect.
  if (shouldRedirect) return <ShellSkeleton />;

  if (isForbidden) return null;

  if (shouldExplainToMember) return <WaitingOnOwnerScreen />;

  if (state?.status === "needs_reauth") {
    return (
      <>
        <ReconnectBanner />
        {children}
      </>
    );
  }

  return <>{children}</>;
}

function WaitingOnOwnerScreen() {
  const t = useTranslations("appShell.waitingOnOwner");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("description")}</p>
    </div>
  );
}

function ReconnectBanner() {
  const t = useTranslations("appShell.reconnectBanner");
  const { isRedirecting, startAuthorize } = useConnectionAuthorize();

  return (
    <div className="border-warning/30 bg-warning-soft flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[13px]">
      <LuTriangleAlert className="text-warning size-4 shrink-0" />
      <span className="text-foreground flex-1">{t("message")}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={isRedirecting}
        onClick={() => startAuthorize("settings")}>
        {t("action")}
      </Button>
    </div>
  );
}
