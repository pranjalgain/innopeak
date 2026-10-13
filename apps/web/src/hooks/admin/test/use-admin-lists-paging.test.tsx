import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import { AdminUserService } from "@/app/_libs/services/admin-user.service";
import { resetNavigation, setNavigationDelay } from "@/test/mock-navigation";

import messages from "../../../../messages/en.json";
import { useAdminBusinesses } from "../use-admin-businesses";
import { useAdminUsers } from "../use-admin-users";

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

describe("useAdminBusinesses — server-side paging", () => {
  beforeEach(() => {
    resetNavigation("/admin/businesses");
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("asks the server for one page of 10, and exposes the page count and total", async () => {
    const getBusinesses = vi
      .spyOn(AdminBusinessService, "getBusinesses")
      .mockResolvedValue({ businesses: [], meta: meta(1, 25) });

    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(3));

    expect(getBusinesses).toHaveBeenCalledWith({ search: undefined, page: 1, pageSize: 10 });
    expect(result.current.total).toBe(25);
  });

  test("moving to the next page requests that page, and never goes past the last", async () => {
    const getBusinesses = vi
      .spyOn(AdminBusinessService, "getBusinesses")
      .mockImplementation((params) =>
        Promise.resolve({ businesses: [], meta: meta(params?.page ?? 1, 15) }),
      );
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(2));

    act(() => result.current.goToNextPage());
    await waitFor(() =>
      expect(getBusinesses).toHaveBeenLastCalledWith({ search: undefined, page: 2, pageSize: 10 }),
    );
    act(() => result.current.goToNextPage());

    expect(result.current.page).toBe(2);
  });

  // Regression guard: a new search could otherwise leave the view on a page that no longer exists.
  test("a new search starts again from page 1", async () => {
    const getBusinesses = vi
      .spyOn(AdminBusinessService, "getBusinesses")
      .mockImplementation((params) =>
        Promise.resolve({ businesses: [], meta: meta(params?.page ?? 1, 40) }),
      );
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(4));
    act(() => result.current.goToNextPage());
    await waitFor(() => expect(result.current.page).toBe(2));

    act(() => result.current.setSearch("coastal"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await waitFor(() =>
      expect(getBusinesses).toHaveBeenLastCalledWith({ search: "coastal", page: 1, pageSize: 10 }),
    );
    expect(result.current.page).toBe(1);
  });

  test("reads the page and search term from the URL, so a deep link or reload keeps the place", async () => {
    resetNavigation("/admin/businesses?page=3&q=coastal");
    const getBusinesses = vi
      .spyOn(AdminBusinessService, "getBusinesses")
      .mockImplementation((params) =>
        Promise.resolve({ businesses: [], meta: meta(params?.page ?? 1, 40) }),
      );

    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(4));

    expect(getBusinesses).toHaveBeenCalledWith({ search: "coastal", page: 3, pageSize: 10 });
    expect(result.current.page).toBe(3);
    expect(result.current.search).toBe("coastal");
  });

  test("changing page puts the page in the URL and Back returns to the previous one", async () => {
    vi.spyOn(AdminBusinessService, "getBusinesses").mockImplementation((params) =>
      Promise.resolve({ businesses: [], meta: meta(params?.page ?? 1, 40) }),
    );
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(4));

    act(() => result.current.goToNextPage());
    await waitFor(() => expect(result.current.page).toBe(2));
    expect(window.location.search).toBe("?page=2");

    act(() => window.history.back());
    await waitFor(() => expect(result.current.page).toBe(1));
    expect(window.location.search).toBe("");
  });

  test("a new search is written to the URL and drops the page", async () => {
    resetNavigation("/admin/businesses?page=2");
    vi.spyOn(AdminBusinessService, "getBusinesses").mockImplementation((params) =>
      Promise.resolve({ businesses: [], meta: meta(params?.page ?? 1, 40) }),
    );
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(4));

    act(() => result.current.setSearch("harbor"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    await waitFor(() => expect(window.location.search).toBe("?q=harbor"));
  });

  test("Back restores the previous search term into the box", async () => {
    resetNavigation("/admin/businesses?q=harbor");
    vi.spyOn(AdminBusinessService, "getBusinesses").mockResolvedValue({
      businesses: [],
      meta: meta(1, 5),
    });
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.search).toBe("harbor"));

    act(() => {
      window.history.pushState(null, "", "/admin/businesses?q=pier");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(result.current.search).toBe("pier"));
  });

  // Regression: with the router applying URL changes a moment late, the page clamp triggered by the new term's (empty)
  // results read the old URL and overwrote the term that had just been requested, leaving `?q=<old term>`.
  test("a new search that matches nothing still lands in the URL while the router is slow", async () => {
    resetNavigation("/admin/businesses?q=seed&page=2");
    setNavigationDelay(500);
    vi.spyOn(AdminBusinessService, "getBusinesses").mockImplementation((params) =>
      Promise.resolve({
        businesses: [],
        meta: meta(params?.page ?? 1, params?.search === "harbor" ? 0 : 40),
      }),
    );
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(4));

    act(() => result.current.setSearch("harbor"));
    // The debounce, the request, the page clamp and the delayed navigation each need their own turn of the clock.
    for (let turn = 0; turn < 4; turn += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }

    expect(window.location.search).toBe("?q=harbor");
  });

  test("a page past the end (an old link, a shrunken list) is pulled back to the last page", async () => {
    resetNavigation("/admin/businesses?page=9");
    vi.spyOn(AdminBusinessService, "getBusinesses").mockImplementation((params) =>
      Promise.resolve({ businesses: [], meta: meta(params?.page ?? 1, 15) }),
    );
    renderHook(() => useAdminBusinesses(), { wrapper });

    await waitFor(() => expect(window.location.search).toBe("?page=2"));
  });
});

describe("useAdminUsers — server-side paging", () => {
  beforeEach(() => resetNavigation("/admin/users"));
  afterEach(() => vi.restoreAllMocks());

  test("asks the server for one page of 10, and exposes the page count and total", async () => {
    const getUsers = vi
      .spyOn(AdminUserService, "getUsers")
      .mockResolvedValue({ users: [], meta: meta(1, 12) });

    const { result } = renderHook(() => useAdminUsers(), { wrapper });
    await waitFor(() => expect(result.current.totalPages).toBe(2));

    expect(getUsers).toHaveBeenCalledWith({ search: undefined, page: 1, pageSize: 10 });
    expect(result.current.total).toBe(12);
  });
});

describe("useAdminBusinesses — cancelling an erasure that is not pending", () => {
  beforeEach(() => resetNavigation("/admin/businesses"));
  afterEach(() => vi.restoreAllMocks());

  test("says there is nothing to cancel and refreshes the list, instead of a generic retry", async () => {
    const { toast } = await import("sonner");
    vi.spyOn(AdminBusinessService, "getBusinesses").mockResolvedValue({
      businesses: [],
      meta: meta(1, 1),
    });
    const { ApiError } = await import("@/app/_libs/services/api-error");
    vi.spyOn(AdminBusinessService, "cancelErasure").mockRejectedValue(
      new ApiError(409, "nothing to cancel", "BUSINESS_ERASURE_NOT_PENDING"),
    );
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const callsBefore = vi.mocked(AdminBusinessService.getBusinesses).mock.calls.length;

    await act(async () => {
      await result.current.cancelErasure("tenant-1");
    });

    expect(toast.error).toHaveBeenCalledWith(messages.adminBusinesses.toasts.cancelErasureNotPending);
    await waitFor(() =>
      expect(vi.mocked(AdminBusinessService.getBusinesses).mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  test("any other failure keeps the generic message", async () => {
    const { toast } = await import("sonner");
    vi.spyOn(AdminBusinessService, "getBusinesses").mockResolvedValue({
      businesses: [],
      meta: meta(1, 1),
    });
    vi.spyOn(AdminBusinessService, "cancelErasure").mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useAdminBusinesses(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.cancelErasure("tenant-1");
    });

    expect(toast.error).toHaveBeenCalledWith(messages.adminBusinesses.toasts.cancelErasureFailed);
  });
});
