import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { MOCK_SETTINGS } from "@/app/_libs/mock-data/settings";
import { BillingService } from "@/app/_libs/services/billing.service";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { SettingsService } from "@/app/_libs/services/settings.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { PlatformSettings, Subscription, TenantOwnerProfile } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { SettingsView } from "../settings-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/settings",
  // Default tab (`general`) so only `GeneralSettingsSection` mounts — Radix `TabsContent` doesn't
  // mount an inactive tab's children, so this keeps the fixture to exactly what the tab-list
  // itself needs, regardless of what `BillingSettingsSection`'s own queries would otherwise need.
  useSearchParams: () => new URLSearchParams(),
}));

const OWNER_PROFILE: TenantOwnerProfile = {
  name: "Jordan Rivera",
  email: "owner@example.com",
  avatarUrl: null,
  hasPassword: true,
  businessName: "The Coastal Table",
  role: "owner",
};

const PLATFORM_SETTINGS_BILLING_OFF: PlatformSettings = {
  ssoLoginEnabled: true,
  passwordLoginEnabled: true,
  socialLoginEnabled: true,
  inviteMembersEnabled: true,
  paymentFeatureEnabled: false,
};

const PAID_SUBSCRIPTION: Subscription = {
  planCode: "paid",
  status: "active",
  currentPeriodStart: "2026-09-01T00:00:00.000Z",
  currentPeriodEnd: "2026-10-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  activeLocationCount: 2,
  maxLocations: null,
  teamMemberCount: 1,
  maxTeamMembers: null,
  aiDraftsUsedThisMonth: 0,
  maxAiDraftsPerMonth: null,
  customPromptsEnabled: true,
  paymentMethod: { brand: "visa", last4: "4242", expMonth: 12, expYear: 2030 },
  paymentProvider: "stripe",
};

const FREE_SUBSCRIPTION: Subscription = {
  ...PAID_SUBSCRIPTION,
  planCode: "free",
  maxLocations: 1,
  maxTeamMembers: 1,
  maxAiDraftsPerMonth: 20,
  customPromptsEnabled: false,
  paymentMethod: null,
};

function renderView() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <SettingsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SettingsView — Billing tab availability", () => {
  beforeEach(() => {
    vi.spyOn(TenantOwnerProfileService, "get").mockResolvedValue(OWNER_PROFILE);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(MOCK_SETTINGS);
  });

  /**
   * The scenario this whole fix is for: an operator disables `PAYMENT_FEATURE_ENABLED` (which
   * only ever gates *starting a new checkout*) while a tenant is still on a live, auto-renewing
   * Stripe subscription. Without `billingTabAvailable`'s override, the tab — and with it the only
   * in-app "Cancel subscription" button — disappeared entirely, leaving that tenant charged every
   * cycle with no way to stop it short of contacting support directly.
   */
  test("keeps the Billing tab for a tenant already on Paid, even with PAYMENT_FEATURE_ENABLED off", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue(PLATFORM_SETTINGS_BILLING_OFF);
    vi.spyOn(BillingService, "getSubscription").mockResolvedValue(PAID_SUBSCRIPTION);

    renderView();

    expect(await screen.findByRole("tab", { name: /billing/i })).toBeInTheDocument();
  });

  test("still hides the Billing tab for a Free tenant when PAYMENT_FEATURE_ENABLED is off", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue(PLATFORM_SETTINGS_BILLING_OFF);
    vi.spyOn(BillingService, "getSubscription").mockResolvedValue(FREE_SUBSCRIPTION);

    renderView();

    // Wait for the settled state via a tab that's always offered, then assert Billing is absent —
    // asserting an absence directly would otherwise race the initial loading skeleton.
    expect(await screen.findByRole("tab", { name: /general/i })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /billing/i })).not.toBeInTheDocument();
  });

  test("shows the Billing tab for a Free tenant when PAYMENT_FEATURE_ENABLED is on", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      ...PLATFORM_SETTINGS_BILLING_OFF,
      paymentFeatureEnabled: true,
    });
    vi.spyOn(BillingService, "getSubscription").mockResolvedValue(FREE_SUBSCRIPTION);

    renderView();

    expect(await screen.findByRole("tab", { name: /billing/i })).toBeInTheDocument();
  });
});
