
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NOTIFICATIONS_FIXTURE } from "@/test/fixtures/notifications";
import { NotificationService } from "@/app/_libs/services/notification.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../messages/en.json";
import { useNotifications } from "../use-notifications";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// Fresh QueryClient per render so cached pages can't leak between tests.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe("useNotifications", () => {
  // Default `NotificationService.list` implementation pages through `NOTIFICATIONS_FIXTURE`; tests
  // layer `mockResolvedValueOnce`/`mockRejectedValueOnce` on top.
  beforeEach(() => {
    vi.spyOn(NotificationService, "list").mockImplementation(async (offset, limit) => {
      const items = structuredClone(NOTIFICATIONS_FIXTURE).slice(offset, offset + limit);
      return {
        items,
        hasMore: offset + limit < NOTIFICATIONS_FIXTURE.length,
        unreadTotal: NOTIFICATIONS_FIXTURE.filter((notification) => !notification.isRead).length,
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("loads exactly one page on mount, even under StrictMode's double-invoked effect", async () => {
    const list = vi.spyOn(NotificationService, "list");

    const { result } = renderHook(() => useNotifications(), {
      wrapper: ({ children }) => <StrictMode>{wrapper({ children })}</StrictMode>,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // StrictMode mounts effects twice; without the initial-load guard offset 0 is fetched twice and rows duplicate.
    expect(result.current.notifications).toHaveLength(3);
    expect(new Set(result.current.notifications.map((n) => n.id)).size).toBe(3);
    expect(result.current.hasMore).toBe(true);
    expect(list).toHaveBeenCalledWith(0, 3);
  });

  test("fetchNextPage appends the next page rather than replacing the list", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notifications).toHaveLength(3);

    act(() => {
      result.current.fetchNextPage();
    });

    // Waits on the page arriving, not `isFetchingNextPage` flipping back: react-query notifies a tick
    // later, so `waitFor` on that flag could see "not fetching" before the fetch even started.
    await waitFor(() => expect(result.current.notifications).toHaveLength(5));
    expect(new Set(result.current.notifications.map((n) => n.id)).size).toBe(5);
    expect(result.current.hasMore).toBe(false);
  });

  test("unreadCount is the whole feed's total, not just the loaded rows", async () => {
    // Every unread notification is past the first page, so a count from loaded rows would hide the bell dot.
    vi.spyOn(NotificationService, "list").mockResolvedValueOnce({
      items: [{ ...NOTIFICATIONS_FIXTURE[0]!, isRead: true }],
      hasMore: true,
      unreadTotal: 4,
    });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.notifications.filter((n) => !n.isRead)).toHaveLength(0);
    expect(result.current.unreadCount).toBe(4);
  });

  test("marking one read decrements the total once, even under StrictMode", async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: ({ children }) => <StrictMode>{wrapper({ children })}</StrictMode>,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = result.current.unreadCount;
    const unread = result.current.notifications.find((n) => !n.isRead);
    // Echoes the optimistic value back; the reconcile is covered separately below.
    vi.spyOn(NotificationService, "markAsRead").mockResolvedValue(before - 1);

    act(() => result.current.markAsRead(unread!.id));

    // `waitFor`, not an immediate assertion (same react-query timing as above).
    await waitFor(() => expect(result.current.unreadCount).toBe(before - 1));
  });

  /** Regression: the write was a `setTimeout` stub, so a reload brought every notification back unread; the server's post-write count is the truth. */
  test("replaces the optimistic unread guess with the server's own count", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const unread = result.current.notifications.find((n) => !n.isRead);
    vi.spyOn(NotificationService, "markAsRead").mockResolvedValue(9);

    act(() => result.current.markAsRead(unread!.id));

    await waitFor(() => expect(result.current.unreadCount).toBe(9));
  });

  test("mark-all takes the server's count rather than assuming zero", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const markAll = vi.spyOn(NotificationService, "markAllAsRead").mockResolvedValue(2);

    act(() => result.current.markAllAsRead());

    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    expect(markAll).toHaveBeenCalled();
    expect(result.current.notifications.every((n) => n.isRead)).toBe(true);
  });

  test("refetches rather than keeping an optimistic value the server rejected", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const before = result.current.unreadCount;
    const unread = result.current.notifications.find((n) => !n.isRead);
    vi.spyOn(NotificationService, "markAsRead").mockRejectedValue(new Error("offline"));

    act(() => result.current.markAsRead(unread!.id));

    // The refetch reinstates what the server actually holds, undoing the optimistic decrement.
    await waitFor(() => expect(result.current.unreadCount).toBe(before));
  });

  test("a failed paging request reports nextPageFailed instead of toasting", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.spyOn(NotificationService, "list").mockRejectedValueOnce(new Error("offline"));

    await act(async () => {
      result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.nextPageFailed).toBe(true));

    // Scrolling again must not re-fire (and re-toast) against a failing endpoint.
    const list = vi.spyOn(NotificationService, "list");
    list.mockClear();
    act(() => result.current.fetchNextPage());
    expect(list).not.toHaveBeenCalled();

    // The explicit retry does go again.
    await act(async () => {
      result.current.retryNextPage();
    });
    await waitFor(() => expect(result.current.notifications).toHaveLength(5));
    expect(result.current.nextPageFailed).toBe(false);
  });

  test("a second fetchNextPage call is ignored while one is already in flight", async () => {
    const list = vi.spyOn(NotificationService, "list");
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    list.mockClear();

    act(() => {
      result.current.fetchNextPage();
      result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false));
    expect(list).toHaveBeenCalledTimes(1);
  });
});
