import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { AdminBusinessService } from "@/app/_libs/services/admin-business.service";
import { AdminUserService } from "@/app/_libs/services/admin-user.service";

import messages from "../../../../messages/en.json";
import { useAdminBusinesses } from "../use-admin-businesses";
import { useAdminUsers } from "../use-admin-users";

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
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
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
});

describe("useAdminUsers — server-side paging", () => {
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
