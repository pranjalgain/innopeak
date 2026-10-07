"use client";

import type { ReactNode } from "react";

import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { useAdminGuard } from "@/hooks/admin/use-admin-guard";

interface AdminGuardProps {
  children: ReactNode;
}

/** Requires a platform-admin session; the decision logic lives in `useAdminGuard`. */
export function AdminGuard({ children }: AdminGuardProps) {
  const { isChecking, isAllowed } = useAdminGuard();

  if (isChecking) return <ShellSkeleton />;

  if (!isAllowed) return null;

  return <>{children}</>;
}
