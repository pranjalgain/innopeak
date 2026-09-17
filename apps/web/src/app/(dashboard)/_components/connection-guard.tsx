"use client";


import { useRouter } from "next/navigation";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect } from "react";
import { LuTriangleAlert } from "react-icons/lu";


import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { ConnectionService } from "@/app/_libs/services/connection.service";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/hooks/connections/use-connection";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

interface ConnectionGuardProps {
  children: ReactNode;
}

/**
 * Gates the dashboard on a connected Google Business Profile.
 *
 * Replaces `GoogleConnectionGuard`, which read a `localStorage` flag written by the browser that
 * happened to run onboarding. Three behaviours here are deliberate and were wrong before:
 *
 *  - **`needs_reauth` renders the app**, with a reconnect banner. Blanking a paying tenant's
 *    dashboard because a refresh token expired reads as data loss; their reviews and history are
 *    all still there, and the only thing broken is ingestion of new ones.
 *  - **A network or 5xx failure fails open.** Ejecting a signed-in user into onboarding because
 *    one request timed out is a far worse outcome than briefly showing a dashboard to someone who
 *    turns out not to be connected. A genuine 401 is handled upstream — `ApiClient` clears the
 *    token and `RequireAuth` redirects to /login — so failing open cannot mask an auth failure.
 *  - **A 403 does NOT fail open.** `useConnection`'s own exclusion only covers 401 (handled
 *    upstream, as above) — a 403 is `requireTenantUser` on the backend rejecting a caller who
 *    isn't even a tenant user at all, e.g. a platform admin's valid token reaching this component
 *    (which `RequireAuth` is now supposed to catch first, but this is the one place that would
 *    otherwise silently render a broken dashboard shell — empty data, no error — if it somehow
 *    didn't). Unlike a 5xx, retrying this can never succeed, so failing open here would just hide
 *    a real, permanent access problem instead of surfacing it.
 *  - **A `member` never reaches the connect stepper.** `disconnected` used to redirect every
 *    caller there, but every route the stepper drives (`GET /v1/connections/google/authorize`,
 *    `POST /v1/connections/locations`, …) is `@Roles(UserRole.OWNER)` — a member landed on a
 *    stepper whose only button 403s, with no way off it (this component runs on every dashboard
 *    route, so there is nowhere else to navigate to). They get `WaitingOnOwnerScreen` instead,
 *    which explains the state rather than offering an action that cannot succeed.
 */
export function ConnectionGuard({ children }: ConnectionGuardProps) {
  const { state, isLoading, error } = useConnection();
  // The redirect-vs-explain decision below must not fire before this resolves — `isMember`
  // defaults to `false` while `profile` is still loading, so redirecting on that default would
  // send an about-to-be-revealed member to the stepper for one render before bouncing them back.
  const { profile, isLoading: isProfileLoading } = useTenantOwnerProfile();
  const isMember = profile?.role === "member";
  const router = useRouter();

  const isForbidden = error instanceof ApiError && error.statusCode === 403;
  const isDisconnected = !isLoading && !error && state?.status === "disconnected";
  const shouldRedirect = isDisconnected && !isProfileLoading && !isMember;
  const shouldExplainToMember = isDisconnected && !isProfileLoading && isMember;

  useEffect(() => {
    if (shouldRedirect) router.replace(ROUTES.ONBOARDING_CONNECT);
    // A hard redirect, not router.replace() — an already-signed-in visitor landing back on
    // /login would just be bounced straight into this same rejection again (see RequireAuth's own
    // doc comment on why a valid-but-wrong-type token can't be routed through /login).
    else if (isForbidden) window.location.href = ROUTES.FORBIDDEN;
  }, [shouldRedirect, isForbidden, router]);

  if (isLoading || (isDisconnected && isProfileLoading)) return <ShellSkeleton />;

  // Only the brief instant before either redirect fires renders nothing.
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

/**
 * Where a `member` lands instead of the connect stepper while their tenant has no Google Business
 * Profile connected yet — see `ConnectionGuard`'s own comment on why a member cannot use that
 * stepper at all. Expected to be rare: almost every invite lands on an already-connected tenant,
 * since inviting a teammate is itself something only an owner who has set the business up does.
 */
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
