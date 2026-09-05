"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useSession } from "@/hooks/auth/use-session";

interface AdminGuardProps {
  children: React.ReactNode;
}

/**
 * Every screen under `/admin` requires the mock session role to be
 * "super_admin" — a tenant owner has no access here, mirroring how the real
 * backend keeps `platform_admins` as a separate identity from tenant
 * `users`. Redirects to `/login` otherwise. While the role check is
 * loading, renders a shell-shaped skeleton instead of `null` (same pattern
 * as `GoogleConnectionGuard`).
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { role, isLoading } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && role !== "super_admin") {
      router.replace(ROUTES.LOGIN);
    }
  }, [isLoading, role, router]);

  if (isLoading) return <ShellSkeleton />;

  if (role !== "super_admin") return null;

  return <>{children}</>;
}
