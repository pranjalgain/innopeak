"use client";

import { type ReactNode, useEffect } from "react";

import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { LuTriangleAlert } from "react-icons/lu";

import { Button } from "@/components/ui/button";

import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useConnection } from "@/app/_libs/providers/connection-provider";
import { ConnectionService } from "@/app/_libs/services/connection.service";

interface ConnectionGuardProps {
  children: ReactNode;
}

/**
 * Gates the dashboard on a connected Google Business Profile.
 *
 * Replaces `GoogleConnectionGuard`, which read a `localStorage` flag written by the browser that
 * happened to run onboarding. Two behaviours here are deliberate and were wrong before:
 *
 *  - **`needs_reauth` renders the app**, with a reconnect banner. Blanking a paying tenant's
 *    dashboard because a refresh token expired reads as data loss; their reviews and history are
 *    all still there, and the only thing broken is ingestion of new ones.
 *  - **A network or 5xx failure fails open.** Ejecting a signed-in user into onboarding because
 *    one request timed out is a far worse outcome than briefly showing a dashboard to someone who
 *    turns out not to be connected. A genuine 401 is handled upstream — `ApiClient` clears the
 *    token and `RequireAuth` redirects to /login — so failing open cannot mask an auth failure.
 */
export function ConnectionGuard({ children }: ConnectionGuardProps) {
  const { state, isLoading, error } = useConnection();
  const router = useRouter();

  const shouldRedirect = !isLoading && !error && state?.status === "disconnected";

  useEffect(() => {
    if (shouldRedirect) router.replace(ROUTES.ONBOARDING_CONNECT);
  }, [shouldRedirect, router]);

  if (isLoading) return <ShellSkeleton />;

  // Only the brief instant before the redirect fires renders nothing.
  if (shouldRedirect) return null;

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

function ReconnectBanner() {
  const t = useTranslations("appShell.reconnectBanner");

  return (
    <div className="border-warning/30 bg-warning-soft flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[13px]">
      <LuTriangleAlert className="text-warning size-4 shrink-0" />
      <span className="text-foreground flex-1">{t("message")}</span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void ConnectionService.startAuthorize("settings")}>
        {t("action")}
      </Button>
    </div>
  );
}
