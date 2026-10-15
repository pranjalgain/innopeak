import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { AdminActivityView } from "../admin-activity-view";

const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/activity",
  useSearchParams: () => new URLSearchParams(search.value),
}));

const state = vi.hoisted(() => ({
  paymentFeatureEnabled: false as boolean | undefined,
  hasPaidTenants: false as boolean | undefined,
  settingsFailed: false,
  paidTenantsFailed: false,
}));
vi.mock("@/hooks/common/use-platform-settings", () => ({
  usePlatformSettings: () => ({
    data:
      state.paymentFeatureEnabled === undefined
        ? undefined
        : { paymentFeatureEnabled: state.paymentFeatureEnabled },
    isError: state.settingsFailed,
  }),
}));
vi.mock("@/hooks/admin/use-admin-has-paid-tenants", () => ({
  useAdminHasPaidTenants: () => ({
    data: state.hasPaidTenants,
    isError: state.paidTenantsFailed,
  }),
}));

// The two cards fetch their own data; this test is about which tabs exist.
vi.mock("@/app/admin/activity/_components/platform-activity-log-card", () => ({
  PlatformActivityLogCard: () => <div>platform activity card</div>,
}));
vi.mock("@/app/admin/billing/_components/billing-webhook-events-card", () => ({
  BillingWebhookEventsCard: () => <div>webhook events card</div>,
}));

const tabs = messages.adminActivity.tabs;

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminActivityView />
    </NextIntlClientProvider>,
  );
}

describe("AdminActivityView — the webhook activity tab", () => {
  beforeEach(() => {
    search.value = "";
    state.paymentFeatureEnabled = false;
    state.hasPaidTenants = false;
    state.settingsFailed = false;
    state.paidTenantsFailed = false;
  });

  test("is hidden when payments are off and no business is on Paid, and with it the whole tab bar", () => {
    renderView();

    // Platform activity is the only thing left, so there is nothing to switch between.
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("platform activity card")).toBeTruthy();
  });

  test("is shown when payments are on", () => {
    state.paymentFeatureEnabled = true;
    renderView();

    expect(screen.getByRole("tab", { name: tabs.platformActivity })).toBeTruthy();
    expect(screen.getByRole("tab", { name: tabs.webhookActivity })).toBeTruthy();
  });

  // Stripe keeps billing existing Paid businesses, so their events still arrive after payments are switched off.
  test("is shown while any business is still on Paid, even with payments off", () => {
    state.hasPaidTenants = true;
    renderView();

    expect(screen.getByRole("tab", { name: tabs.webhookActivity })).toBeTruthy();
  });

  test("stays out of the way while the settings are still loading", () => {
    state.paymentFeatureEnabled = undefined;
    state.hasPaidTenants = undefined;
    renderView();

    expect(screen.queryByRole("tablist")).toBeNull();
  });

  // Payments are off but a Paid business is still billed: a failed check must not read as "no webhook deliveries".
  test.each([
    ["the paid-tenants check", "paidTenantsFailed"],
    ["the platform settings", "settingsFailed"],
  ] as const)("is shown when %s fails to load", (_label, flag) => {
    state.hasPaidTenants = undefined;
    state.paymentFeatureEnabled = undefined;
    state[flag] = true;
    renderView();

    expect(screen.getByRole("tab", { name: tabs.webhookActivity })).toBeTruthy();
  });

  test("a bookmarked link to the hidden tab lands on platform activity", () => {
    search.value = "tab=webhookActivity";
    renderView();

    expect(screen.getByText("platform activity card")).toBeTruthy();
    expect(screen.queryByText("webhook events card")).toBeNull();
  });

  test("a link to the tab opens it when it is available", () => {
    search.value = "tab=webhookActivity";
    state.paymentFeatureEnabled = true;
    renderView();

    expect(screen.getByText("webhook events card")).toBeTruthy();
  });
});
