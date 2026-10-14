import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useNotificationStream } from "../use-notification-stream";

const listNotifications = vi.hoisted(() => vi.fn());
vi.mock("@/app/_libs/services/notification.service", () => ({
  NotificationService: { list: listNotifications },
}));

type Listener = () => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  withCredentials: boolean;
  closed = false;
  onerror: (() => void) | null = null;
  private listeners = new Map<string, Listener[]>();

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  fail() {
    this.onerror?.();
  }
}

/** In-memory stand-in: every instance with the same name hears what the others post, as tabs of one browser do. */
class FakeBroadcastChannel {
  static all: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  closed = false;

  constructor(public name: string) {
    FakeBroadcastChannel.all.push(this);
  }

  postMessage(data: unknown) {
    for (const other of FakeBroadcastChannel.all) {
      if (other !== this && !other.closed && other.name === this.name) {
        other.onmessage?.({ data } as MessageEvent<unknown>);
      }
    }
  }

  close() {
    this.closed = true;
  }
}

const latest = () => FakeEventSource.instances.at(-1)!;

describe("useNotificationStream", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeEventSource.instances = [];
    FakeBroadcastChannel.all = [];
    listNotifications.mockReset().mockResolvedValue({ items: [], unreadTotal: 0, hasMore: false });
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    // No Web Locks in this environment unless a test installs them: every tab then opens its own stream.
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("opens one stream on the same-origin route, with the session cookie", () => {
    renderHook(() => useNotificationStream({ enabled: true, onNotice: vi.fn() }));

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latest().url).toBe("/v1/notifications/stream");
    expect(latest().withCredentials).toBe(true);
  });

  test("opens nothing until enabled, and nothing at all where EventSource does not exist", () => {
    const { rerender } = renderHook(
      ({ enabled }) => useNotificationStream({ enabled, onNotice: vi.fn() }),
      { initialProps: { enabled: false } },
    );
    expect(FakeEventSource.instances).toHaveLength(0);

    rerender({ enabled: true });
    expect(FakeEventSource.instances).toHaveLength(1);

    vi.unstubAllGlobals();
    FakeEventSource.instances = [];
    const { rerender: again } = renderHook(
      ({ enabled }) => useNotificationStream({ enabled, onNotice: vi.fn() }),
      { initialProps: { enabled: false } },
    );
    expect(() => again({ enabled: true })).not.toThrow();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  test("reports connected once the server says ready, without a needless catch-up when the feed was just fetched", () => {
    const onNotice = vi.fn();
    const { result } = renderHook(() =>
      useNotificationStream({ enabled: true, onNotice, isFeedFresh: () => true }),
    );
    expect(result.current.connected).toBe(false);

    act(() => latest().emit("ready"));

    expect(result.current.connected).toBe(true);
    expect(onNotice).not.toHaveBeenCalled();
  });

  test("calls onNotice for every notification event", () => {
    const onNotice = vi.fn();
    renderHook(() => useNotificationStream({ enabled: true, onNotice, isFeedFresh: () => true }));
    act(() => latest().emit("ready"));

    act(() => latest().emit("notification"));
    act(() => latest().emit("notification"));

    expect(onNotice).toHaveBeenCalledTimes(2);
  });

  test("ignores heartbeats", () => {
    const onNotice = vi.fn();
    renderHook(() => useNotificationStream({ enabled: true, onNotice }));

    act(() => latest().emit("heartbeat"));

    expect(onNotice).not.toHaveBeenCalled();
  });

  test("on a drop: closes, waits a jittered backoff, checks the session with a read, reconnects and catches up", async () => {
    const onNotice = vi.fn();
    const { result } = renderHook(() =>
      useNotificationStream({ enabled: true, onNotice, isFeedFresh: () => true }),
    );
    act(() => latest().emit("ready"));
    const first = latest();

    act(() => first.fail());
    expect(first.closed).toBe(true);
    expect(result.current.connected).toBe(false);
    expect(FakeEventSource.instances).toHaveLength(1); // not reconnected yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(listNotifications).toHaveBeenCalledTimes(1);
    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => latest().emit("ready"));
    expect(result.current.connected).toBe(true);
    // Whatever arrived while the stream was down is picked up by refetching once.
    expect(onNotice).toHaveBeenCalledTimes(1);
  });

  test("backs off further after repeated failures, and still reconnects when the session check fails", async () => {
    listNotifications.mockRejectedValue(new Error("429"));
    renderHook(() => useNotificationStream({ enabled: true, onNotice: vi.fn() }));

    act(() => latest().fail());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(FakeEventSource.instances).toHaveLength(2);

    act(() => latest().fail());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    // The second wait is longer than the first (exponential), so it has not fired yet.
    expect(FakeEventSource.instances).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(FakeEventSource.instances).toHaveLength(3);
  });

  test("closes the stream and cancels a pending reconnect on unmount", async () => {
    const { unmount } = renderHook(() =>
      useNotificationStream({ enabled: true, onNotice: vi.fn() }),
    );
    const first = latest();
    act(() => first.fail());

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(FakeEventSource.instances).toHaveLength(1);
  });

  test("closes the open stream when disabled again", () => {
    const { rerender } = renderHook(
      ({ enabled }) => useNotificationStream({ enabled, onNotice: vi.fn() }),
      { initialProps: { enabled: true } },
    );
    const stream = latest();

    rerender({ enabled: false });

    expect(stream.closed).toBe(true);
  });

  describe("with several tabs", () => {
    /** A minimal Web Locks: the first requester is granted at once, later ones wait until the holder resolves. */
    function installLocks() {
      const queue: Array<() => void> = [];
      let held = false;
      const grant = (callback: () => Promise<void> | undefined) => {
        held = true;
        void Promise.resolve(callback()).finally(() => {
          held = false;
          queue.shift()?.();
        });
      };
      vi.stubGlobal("navigator", {
        locks: {
          request: (_name: string, _options: unknown, callback: () => Promise<void> | undefined) =>
            new Promise<void>((resolve) => {
              const run = () => {
                grant(callback);
                resolve();
              };
              if (held) queue.push(run);
              else run();
            }),
        },
      });
    }

    test("only the tab holding the lock opens the stream; the others hear it over the channel", async () => {
      installLocks();
      const owner = vi.fn();
      const follower = vi.fn();
      const ownerHook = renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: owner, isFeedFresh: () => true }),
      );
      const followerHook = renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: follower, isFeedFresh: () => true }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(FakeEventSource.instances).toHaveLength(1);

      act(() => latest().emit("ready"));
      act(() => latest().emit("notification"));

      expect(owner).toHaveBeenCalledTimes(1);
      expect(follower).toHaveBeenCalledTimes(1);
      expect(followerHook.result.current.connected).toBe(true);
      expect(ownerHook.result.current.connected).toBe(true);
    });

    test("a waiting tab takes over when the owner closes", async () => {
      installLocks();
      const ownerHook = renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: vi.fn() }),
      );
      renderHook(() => useNotificationStream({ enabled: true, onNotice: vi.fn() }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(FakeEventSource.instances).toHaveLength(1);

      ownerHook.unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(FakeEventSource.instances).toHaveLength(2);
      expect(FakeEventSource.instances[0]!.closed).toBe(true);
    });

    // Regression: only the owner refetched after a reconnect, so every other tab stayed stale until its next (slow) poll.
    test("tells the other tabs to catch up too when the owner reconnects", async () => {
      installLocks();
      const followerNotice = vi.fn();
      renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: vi.fn(), isFeedFresh: () => true }),
      );
      renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: followerNotice, isFeedFresh: () => true }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => latest().emit("ready"));
      expect(followerNotice).not.toHaveBeenCalled();

      act(() => latest().fail());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      act(() => latest().emit("ready"));

      expect(followerNotice).toHaveBeenCalledTimes(1);
    });

    test("a tab stops believing in the stream after the owner has been silent too long", async () => {
      installLocks();
      renderHook(() => useNotificationStream({ enabled: true, onNotice: vi.fn() }));
      const follower = renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: vi.fn() }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      act(() => latest().emit("ready"));
      expect(follower.result.current.connected).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100_000);
      });

      expect(follower.result.current.connected).toBe(false);
    });
  });

  describe("catching up", () => {
    // A feed that is not fresh (a tab taking over, or a cached feed from an earlier visit) may have missed notices before the stream opened.
    test("catches up on the first ready when the feed is not fresh", () => {
      const onNotice = vi.fn();
      renderHook(() =>
        useNotificationStream({ enabled: true, onNotice, isFeedFresh: () => false }),
      );

      act(() => latest().emit("ready"));

      expect(onNotice).toHaveBeenCalledTimes(1);
    });

    test("catches up on every ready when it cannot tell how fresh the feed is", () => {
      const onNotice = vi.fn();
      renderHook(() => useNotificationStream({ enabled: true, onNotice }));

      act(() => latest().emit("ready"));

      expect(onNotice).toHaveBeenCalledTimes(1);
    });
  });

  describe("a stream that goes silent", () => {
    // A sleeping laptop or a middlebox can stall a connection without ever firing an error event.
    test("is treated as dead after a minute without any event, and reconnected", async () => {
      const { result } = renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: vi.fn(), isFeedFresh: () => true }),
      );
      act(() => latest().emit("ready"));
      const stalled = latest();
      expect(result.current.connected).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(61_000);
      });

      expect(stalled.closed).toBe(true);
      expect(result.current.connected).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(FakeEventSource.instances).toHaveLength(2);
    });

    test("stays alive as long as heartbeats keep arriving", async () => {
      const { result } = renderHook(() =>
        useNotificationStream({ enabled: true, onNotice: vi.fn(), isFeedFresh: () => true }),
      );
      act(() => latest().emit("ready"));

      for (let beat = 0; beat < 6; beat += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(25_000);
        });
        act(() => latest().emit("heartbeat"));
      }

      expect(result.current.connected).toBe(true);
      expect(FakeEventSource.instances).toHaveLength(1);
    });
  });
});
