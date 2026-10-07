"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { ConnectionGuard } from "@/app/(dashboard)/_components/connection-guard";
import { NAV_ITEMS } from "@/app/(dashboard)/_components/nav-items";
import { RequireAuth } from "@/app/_components/require-auth";
import { ShellSkeleton } from "@/app/_components/shell-skeleton";
import { ROUTES } from "@/app/_libs/constants/routes";
import { storedDisplayName } from "@/app/_libs/services/tenant-owner-profile.service";
import { getInitials } from "@/app/_libs/utils/initials";
import { useTenantOwnerProfile } from "@/hooks/settings/use-tenant-owner-profile";

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const t = useTranslations("appShell");
  // Same profile Settings reads, so the sidebar and Settings can't disagree.
  const { profile } = useTenantOwnerProfile();
  const displayName = profile?.name ?? storedDisplayName();

  return (
    <RequireAuth loadingFallback={<ShellSkeleton />}>
      <ConnectionGuard>
        <AppShell
          navItems={NAV_ITEMS}
          navNamespace="nav"
          homeHref={ROUTES.DASHBOARD}
          // Always `?tab=profile`: depending on async passwordLoginEnabled raced on a fresh tab
          // (landing on the wrong tab). settings-view falls back to "general" if it's unavailable.
          profileHref={`${ROUTES.SETTINGS}?tab=profile`}
          identity={{
            // Stored name is optimistic until /v1/auth/me answers: a blank name is more jarring than a stale one.
            name: displayName,
            initials: displayName === "" ? "" : getInitials(displayName),
            avatarUrl: profile?.avatarUrl ?? null,
            // Owner label while loading: no stored role exists, and most sessions are owners. Corrects when /me answers.
            roleLabel: profile?.role === "member" ? t("accountMemberRole") : t("accountOwnerRole"),
          }}
        >
          {children}
        </AppShell>
      </ConnectionGuard>
    </RequireAuth>
  );
}
