"use client";


import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { LuTriangleAlert } from "react-icons/lu";


import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/connections/use-connection";
import { useConnectionAuthorize } from "@/hooks/connections/use-connection-authorize";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

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

  const isForbidden = error instanceof ApiError && error.statusCode === 403;
  const isDisconnected = !isLoading && !error && state?.status === "disconnected";
  const shouldRedirect = isDisconnected && !isProfileLoading && !isMember;
  const shouldExplainToMember = isDisconnected && !isProfileLoading && isMember;

  useEffect(() => {
    if (shouldRedirect) router.replace(ROUTES.ONBOARDING_CONNECT);
    // Hard redirect, not router.replace(): /login would bounce a signed-in visitor straight back into this same rejection.
    else if (isForbidden) window.location.href = ROUTES.FORBIDDEN;
  }, [shouldRedirect, isForbidden, router]);

  if (isLoading || (isDisconnected && isProfileLoading)) return <ShellSkeleton />;

  if (shouldRedirect || isForbidden) return null;

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
