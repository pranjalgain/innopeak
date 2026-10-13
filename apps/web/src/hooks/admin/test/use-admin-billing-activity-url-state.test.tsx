import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AdminActivityService } from "@/app/_libs/services/admin-activity.service";
import { AdminBillingService } from "@/app/_libs/services/admin-billing.service";
import { resetNavigation } from "@/test/mock-navigation";

import messages from "../../../../messages/en.json";
import { useAdminBillingWebhookEvents } from "../use-admin-billing-webhook-events";
import { useAdminPlatformActivityLog } from "../use-admin-platform-activity-log";

vi.mock("next/navigation", async () => (await import("@/test/mock-navigation")).navigationMock);
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const meta = (page: number, total: number) => ({
  page,
  pageSize: 10,
  total,
  totalPages: Math.max(1, Math.ceil(total / 10)),
});

afterEach(() => vi.restoreAllMocks());

describe("useAdminBillingWebhookEvents — URL state", () => {
  beforeEach(() => resetNavigation("/admin/billing"));

  function mockList(total: number) {
    return vi
      .spyOn(AdminBillingService, "listWebhookEvents")
      .mockImplementation((params) =>
        Promise.resolve({ events: [], meta: meta(params.page ?? 1, total) }),
      );
  }

  test("reads the page and event type from the URL", async () => {
    resetNavigation("/admin/billing?page=2&type=SUBSCRIPTION_UPDATED");
    const list = mockList(25);

    const { result } = renderHook(() => useAdminBillingWebhookEvents(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(3));

    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 10, type: "SUBSCRIPTION_UPDATED" });
    expect(result.current.filter).toBe("SUBSCRIPTION_UPDATED");
  });

  test("ignores an event type the screen does not offer", async () => {
    resetNavigation("/admin/billing?type=bogus");
    const list = mockList(5);

    const { result } = renderHook(() => useAdminBillingWebhookEvents(), { wrapper });
    await waitFor(() => expect(list).toHaveBeenCalled());

    expect(result.current.filter).toBe("all");
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10, type: undefined });
  });

  test("a new filter goes into the URL and drops the page; paging pushes a history entry Back undoes", async () => {
    resetNavigation("/admin/billing?page=2");
    mockList(40);
    const { result } = renderHook(() => useAdminBillingWebhookEvents(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(4));

    act(() => result.current.setFilter("INVOICE_PAYMENT_FAILED"));
    await waitFor(() => expect(window.location.search).toBe("?type=INVOICE_PAYMENT_FAILED"));

    act(() => result.current.goToNextPage());
    await waitFor(() => expect(result.current.page).toBe(2));
    act(() => window.history.back());
    await waitFor(() => expect(result.current.page).toBe(1));
  });

  test("a page past the end is pulled back to the last page", async () => {
    resetNavigation("/admin/billing?page=9");
    mockList(15);
    renderHook(() => useAdminBillingWebhookEvents(), { wrapper });

    await waitFor(() => expect(window.location.search).toBe("?page=2"));
  });
});

describe("useAdminPlatformActivityLog — URL state", () => {
  beforeEach(() => resetNavigation("/admin/activity"));

  function mockList(total: number) {
    return vi
      .spyOn(AdminActivityService, "listActivity")
      .mockImplementation((params) =>
        Promise.resolve({ activities: [], meta: meta(params.page ?? 1, total) }),
      );
  }

  test("reads the page and action type from the URL", async () => {
    resetNavigation("/admin/activity?page=3&type=user_activated");
    const list = mockList(45);

    const { result } = renderHook(() => useAdminPlatformActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(5));

    expect(list).toHaveBeenCalledWith({ page: 3, pageSize: 10, type: "user_activated" });
  });

  test("ignores an action type the log screen does not offer", async () => {
    // Real activity type, but not one of the filter's options.
    resetNavigation("/admin/activity?type=business_erased");
    const list = mockList(5);

    const { result } = renderHook(() => useAdminPlatformActivityLog(), { wrapper });
    await waitFor(() => expect(list).toHaveBeenCalled());

    expect(result.current.filter).toBe("all");
  });

  test("choosing a filter writes it to the URL and drops the page; clearing it removes it", async () => {
    resetNavigation("/admin/activity?page=2");
    mockList(40);
    const { result } = renderHook(() => useAdminPlatformActivityLog(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(4));

    act(() => result.current.setFilter("admin_enabled"));
    await waitFor(() => expect(window.location.search).toBe("?type=admin_enabled"));
    act(() => result.current.setFilter("all"));
    await waitFor(() => expect(window.location.search).toBe(""));
  });
});
