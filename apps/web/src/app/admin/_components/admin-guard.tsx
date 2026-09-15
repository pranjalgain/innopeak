"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";


import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useAuthToken } from "@/hooks/auth/use-auth-token";
import { useSession } from "@/hooks/auth/use-session";

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Every screen under `/admin` requires BOTH a live session and the "super_admin" role — a tenant
 * owner has no access here, mirroring how the backend keeps `platform_admins` as a separate
 * identity from tenant `users`. Redirects to `/login` otherwise.
 *
 * The token half matters as much as the role half. The role is just a localStorage string, so on
 * its own it is neither an authentication check (anything can write it) nor a *live* one: a
 * platform admin's access token lasts 15 minutes and has no refresh token to renew it (see
 * `TokenService.signPlatformAdminAccessToken` on the backend), so checking only the role left an
 * expired admin sitting inside a fully-rendered admin shell where every request 401'd — empty
 * tables and "Could not load…" toasts instead of being sent back to sign in. `useAuthToken` is the
 * same check `RequireAuth` applies to the tenant dashboard, and is what actually notices the
 * session is gone.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { role, isLoading } = useSession();
  // `reviveMissing`: an admin arriving on a fresh tab has real session cookies but empty
  // localStorage, and must not be bounced before the refresh attempt has had its say.
  const { hasToken } = useAuthToken({ reviveMissing: true });
  const router = useRouter();

  const isChecking = isLoading || hasToken === null;
  const isAllowed = hasToken === true && role === "super_admin";

  useEffect(() => {
    if (!isChecking && !isAllowed) {
      router.replace(ROUTES.LOGIN);
    }
  }, [isChecking, isAllowed, router]);

  if (isChecking) return <ShellSkeleton />;

  if (!isAllowed) return null;

  return <>{children}</>;
}
