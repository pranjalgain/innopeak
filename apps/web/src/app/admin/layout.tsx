"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { AppShell } from "@/app/(dashboard)/_components/app-shell";
import { ROUTES } from "@/app/_libs/constants/routes";
import { platformAdminDisplayName } from "@/app/_libs/utils/admin-identity";
import { getInitials } from "@/app/_libs/utils/initials";
import { AdminGuard } from "@/app/admin/_components/admin-guard";
import { ADMIN_NAV_ITEMS } from "@/app/admin/_components/admin-nav-items";
import { useAdminHasPaidTenants } from "@/hooks/admin/use-admin-has-paid-tenants";
import { usePlatformAdminProfile } from "@/hooks/admin/use-platform-admin-profile";
import { usePlatformSettings } from "@/hooks/common/use-platform-settings";

interface AdminLayoutProps {
  children: ReactNode;
}

/**
 * Separate identity from the tenant dashboard (see `AdminGuard`), sharing the `AppShell` chrome
 * with its own nav and no review notifications.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const t = useTranslations("appShell");
  // Same query cache as Settings' Profile tab, so sidebar and Settings never disagree. Until it
  // resolves the chrome shows an empty name rather than a placeholder identity (no optimistic copy
  // exists for an admin).
  const { profile } = usePlatformAdminProfile();
  const displayName = profile ? platformAdminDisplayName(profile.email) : "";
  // Billing is hidden from the nav when this deploy has no billing wired up (a reflection of a
  // deploy-level env var, not an admin toggle), and while loading to avoid a flash. It stays
  // visible whenever any tenant is on Paid regardless of the flag, which only gates starting new
  // checkouts: Stripe keeps billing existing Paid tenants and an admin must still see them
  // (`useAdminHasPaidTenants`).
  const { data: platformSettings } = usePlatformSettings();
  const { data: hasPaidTenants } = useAdminHasPaidTenants();
  const billingNavAvailable = platformSettings?.paymentFeatureEnabled === true || hasPaidTenants === true;
  const navItems = ADMIN_NAV_ITEMS.filter(
    (item) => item.labelKey !== "billing" || billingNavAvailable
  );

  return (
    <AdminGuard>
      <AppShell
        navItems={navItems}
        navNamespace="adminNav"
        homeHref={ROUTES.ADMIN}
        profileHref={`${ROUTES.ADMIN_SETTINGS}?tab=profile`}
        showNotifications={false}
        showBusinessSwitcher={false}
        identity={{
          name: displayName,
          initials: displayName === "" ? "" : getInitials(displayName),
          avatarUrl: profile?.avatarUrl ?? null,
          roleLabel: t("superAdminRole"),
        }}
      >
        {children}
      </AppShell>
    </AdminGuard>
  );
}
