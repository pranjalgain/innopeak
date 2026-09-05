"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { useGoogleConnection } from "@/hooks/connection/use-google-connection";

interface GoogleConnectionGuardProps {
  children: React.ReactNode;
}

/**
 * Every screen behind login requires a connected Google Business Profile —
 * there's nothing to show otherwise. Redirects to the onboarding-connect
 * flow when disconnected. While the connection status is loading, renders
 * a shell-shaped skeleton instead of `null` so the whole app doesn't blank
 * out on every load — only "disconnected" (the brief instant before the
 * redirect fires) still renders nothing.
 */
export function GoogleConnectionGuard({ children }: GoogleConnectionGuardProps) {
  const { status, isLoading } = useGoogleConnection();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && status === "disconnected") {
      router.replace(ROUTES.ONBOARDING_CONNECT);
    }
  }, [isLoading, status, router]);

  if (isLoading) return <ShellSkeleton />;

  if (status === "disconnected") return null;

  return <>{children}</>;
}
