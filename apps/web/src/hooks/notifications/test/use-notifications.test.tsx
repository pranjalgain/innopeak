
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { NotificationService } from "@/app/_libs/services/notification.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { NOTIFICATIONS_FIXTURE } from "@/test/fixtures/notifications";

import messages from "../../../../messages/en.json";
import {
  NOTIFICATIONS_POLL_MS,
  NOTIFICATIONS_POLL_WITH_STREAM_MS,
  useNotifications,
} from "../use-notifications";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/_libs/api-sdk/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/app/_libs/api-sdk/config")>()),
  refreshSession: vi.fn().mockResolvedValue(true),
}));

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

  // The bell treats the first successful count as its baseline; after a failed load the count reads 0, which is not a baseline.
  test("reports a failed first load as not loaded, so the bell does not take its 0 as a baseline", async () => {
    vi.spyOn(NotificationService, "list").mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isLoaded).toBe(false);
  });

  test("reports loaded after a successful load", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
  });

  // The count moving back up after a failed write is a repair, not news: the hook says so while it repairs.
  test("flags the repair after a failed mark-as-read, so the bell can stay quiet", async () => {
    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    vi.spyOn(NotificationService, "markAsRead").mockRejectedValue(new Error("network"));
    // Holds the repair's refetch open, so the in-between state can be observed.
    let finishRepair!: () => void;
    const repair = new Promise<void>((resolve) => {
      finishRepair = resolve;
    });
    const list = vi.mocked(NotificationService.list);
    const original = list.getMockImplementation()!;
    list.mockImplementation(async (offset, limit) => {
      await repair;
      return original(offset, limit);
    });
    const unread = result.current.notifications.find((notification) => !notification.isRead)!;

    act(() => {
      result.current.markAsRead(unread.id);
    });
    await waitFor(() => expect(result.current.isResyncing).toBe(true));

    await act(async () => {
      finishRepair();
    });
    await waitFor(() => expect(result.current.isResyncing).toBe(false));
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

describe("useNotifications — polling for new notifications", () => {
  let unreadOnServer = 2;

  beforeEach(() => {
    unreadOnServer = 2;
    // Everything is faked, including react-query's own timers, so the tests drive time themselves with `flush`/`until` rather than `waitFor`.
    vi.useFakeTimers();
    vi.spyOn(NotificationService, "list").mockImplementation(async (offset, limit) => ({
      items: structuredClone(NOTIFICATIONS_FIXTURE).slice(offset, offset + limit),
      hasMore: offset + limit < NOTIFICATIONS_FIXTURE.length,
      unreadTotal: unreadOnServer,
    }));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const flush = (ms = 50) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  async function until(condition: () => boolean) {
    for (let attempt = 0; attempt < 40 && !condition(); attempt += 1) await flush();
    expect(condition()).toBe(true);
  }

  async function loaded() {
    const rendered = renderHook(() => useNotifications(), { wrapper });
    await until(() => !rendered.result.current.isLoading);
    return rendered;
  }

  test("makes no extra request at mount: the first poll waits for the interval", async () => {
    const list = vi.spyOn(NotificationService, "list");
    await loaded();

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(0, 3);
  });

  test("refetches the feed when the server reports more unread than the feed shows", async () => {
    const { result } = await loaded();
    expect(result.current.unreadCount).toBe(2);

    unreadOnServer = 3;
    await flush(NOTIFICATIONS_POLL_MS);

    await until(() => result.current.unreadCount === 3);
  });

  test("leaves the feed alone when nothing new arrived (one tiny request, no refetch)", async () => {
    const list = vi.spyOn(NotificationService, "list");
    await loaded();
    list.mockClear();

    await flush(NOTIFICATIONS_POLL_MS);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith(0, 1);
  });

  test("does not poll while the tab is hidden", async () => {
    const list = vi.spyOn(NotificationService, "list");
    await loaded();
    list.mockClear();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });

    await flush(NOTIFICATIONS_POLL_MS * 2);

    expect(list).not.toHaveBeenCalled();
  });

  test("a failed poll is ignored and the next interval tries again", async () => {
    const { result } = await loaded();
    vi.spyOn(NotificationService, "list").mockRejectedValueOnce(new Error("network"));

    await flush(NOTIFICATIONS_POLL_MS);
    expect(result.current.unreadCount).toBe(2);

    unreadOnServer = 4;
    await flush(NOTIFICATIONS_POLL_MS);
    await until(() => result.current.unreadCount === 4);
  });
});

describe("useNotifications — with a live stream", () => {
  type Handler = () => void;
  const streams: Array<{ emit: (type: string) => void }> = [];

  class FakeEventSource {
    onerror: (() => void) | null = null;
    private handlers = new Map<string, Handler[]>();
    constructor() {
      streams.push(this);
    }
    addEventListener(type: string, handler: Handler) {
      this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
    }
    emit(type: string) {
      for (const handler of this.handlers.get(type) ?? []) handler();
    }
    close() {}
  }

  let unreadOnServer = 2;

  beforeEach(() => {
    unreadOnServer = 2;
    streams.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.spyOn(NotificationService, "list").mockImplementation(async (offset, limit) => ({
      items: structuredClone(NOTIFICATIONS_FIXTURE).slice(offset, offset + limit),
      hasMore: offset + limit < NOTIFICATIONS_FIXTURE.length,
      unreadTotal: unreadOnServer,
    }));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const flush = (ms = 50) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  async function until(condition: () => boolean) {
    for (let attempt = 0; attempt < 40 && !condition(); attempt += 1) await flush();
    expect(condition()).toBe(true);
  }

  async function loaded() {
    const rendered = renderHook(() => useNotifications(), { wrapper });
    await until(() => !rendered.result.current.isLoading);
    await flush();
    return rendered;
  }

  test("a pushed notification refetches the feed straight away, without waiting for a poll", async () => {
    const { result } = await loaded();
    expect(streams).toHaveLength(1);
    act(() => streams[0]!.emit("ready"));

    unreadOnServer = 3;
    act(() => streams[0]!.emit("notification"));

    await until(() => result.current.unreadCount === 3);
  });

  test("polls far less often while the stream is up", async () => {
    const list = vi.spyOn(NotificationService, "list");
    await loaded();
    act(() => streams[0]!.emit("ready"));
    await flush();
    list.mockClear();

    // The server's heartbeat keeps the stream (and so the slow cadence) alive; without it the watchdog would call it dead and reconnect.
    const flushWithHeartbeats = async (ms: number) => {
      for (let elapsed = 0; elapsed < ms; elapsed += 25_000) {
        await flush(Math.min(25_000, ms - elapsed));
        act(() => streams[0]!.emit("heartbeat"));
      }
    };

    await flushWithHeartbeats(NOTIFICATIONS_POLL_MS * 2);
    expect(list).not.toHaveBeenCalled();

    await flushWithHeartbeats(NOTIFICATIONS_POLL_WITH_STREAM_MS);
    expect(list).toHaveBeenCalledWith(0, 1);
  });
});
