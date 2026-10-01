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
 * Shell for every screen under `/admin` — a separate identity from the
 * tenant dashboard (see `AdminGuard`), sharing the same `AppShell` chrome
 * with its own nav items and no review notifications.
 */
export default function AdminLayout({ children }: AdminLayoutProps) {
  const t = useTranslations("appShell");
  // Same profile Settings' own Profile tab reads, through the same react-query cache — so the
  // sidebar and Settings can never disagree about who is signed in. Until it resolves the chrome
  // paints with an empty name rather than a placeholder identity: there is no stored optimistic
  // copy for an admin the way `TokenService` keeps one for a tenant owner.
  const { profile } = usePlatformAdminProfile();
  const displayName = profile ? platformAdminDisplayName(profile.email) : "";
  // Billing is a real payment feature, not just an analytics view — hidden from the nav (and
  // therefore unreachable through it) whenever this deploy has no billing wired up at all. See
  // `PlatformSettings.paymentFeatureEnabled`'s own doc comment for why this is a pure reflection
  // of a deploy-level env var, not something a platform admin can toggle. Defaults to hidden
  // while the query is still loading rather than flashing the item and immediately removing it.
  //
  // Also stays visible whenever at least one tenant is on Paid, regardless of the flag — that
  // flag only ever gates *starting* a new checkout, never an already-Paid tenant's subscription
  // (Stripe keeps billing them either way). An admin needs to keep seeing, and acting on, billing
  // for as long as any such tenant exists — see `useAdminHasPaidTenants`'s own doc comment.
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
