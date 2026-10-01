"use client";

import type { ReactNode } from "react";

import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { useAdminGuard } from "@/hooks/admin/use-admin-guard";

interface AdminGuardProps {
  children: ReactNode;
}

/**
 * Every screen under `/admin` requires a live session AND a platform-admin token — a tenant owner
 * has no access here, mirroring how the backend keeps `platform_admins` as a separate identity
 * from tenant `users`. The actual decision (which sources it checks, and why, and where each
 * failure redirects) lives in `useAdminGuard` — this component only binds it to a render.
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { isChecking, isAllowed } = useAdminGuard();

  if (isChecking) return <ShellSkeleton />;

  if (!isAllowed) return null;

  return <>{children}</>;
}
