import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import messages from "../../../../../../messages/en.json";
import { AdminBillingView } from "../admin-billing-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const platform = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const hasPaid = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/hooks/common/use-platform-settings", () => ({
  usePlatformSettings: () => platform.value,
}));
vi.mock("@/hooks/admin/use-admin-has-paid-tenants", () => ({
  useAdminHasPaidTenants: () => hasPaid.value,
}));
vi.mock("@/hooks/admin/use-admin-billing", () => ({
  useAdminBilling: () => ({
    freeCount: 0,
    paidCount: 0,
    activeCount: 0,
    pastDueCount: 0,
    cancelingCount: 0,
    upgradeTrend: [],
    atRisk: [],
    postErasureCharges: [],
    resolvePostErasureCharge: vi.fn(),
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const query = (overrides: Record<string, unknown>) => ({
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  ...overrides,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AdminBillingView />
    </NextIntlClientProvider>,
  );
}

describe("AdminBillingView — availability", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  test("sends the admin to Overview when billing is genuinely unavailable", () => {
    platform.value = query({ data: { paymentFeatureEnabled: false } });
    hasPaid.value = query({ data: false });

    renderView();

    expect(replace).toHaveBeenCalledWith("/admin");
  });

  // A failed read says nothing about availability: bouncing the admin away on a blip made the page unreachable until they navigated back.
  test.each([
    ["platform settings", { isError: true }, { data: false }],
    ["the paid-tenant check", { data: { paymentFeatureEnabled: false } }, { isError: true }],
  ])("offers a retry instead of redirecting when %s fails to load", (_name, platformState, paidState) => {
    const refetchPlatform = vi.fn();
    const refetchPaid = vi.fn();
    platform.value = query({ ...platformState, refetch: refetchPlatform });
    hasPaid.value = query({ ...paidState, refetch: refetchPaid });

    renderView();

    expect(replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: messages.common.loadError.retry }));
    expect(refetchPlatform).toHaveBeenCalled();
    expect(refetchPaid).toHaveBeenCalled();
  });

  test("still shows the page when one read failed but the other proves billing is available", () => {
    platform.value = query({ isError: true });
    hasPaid.value = query({ data: true });

    renderView();

    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: messages.common.loadError.retry })).toBeNull();
  });
});
