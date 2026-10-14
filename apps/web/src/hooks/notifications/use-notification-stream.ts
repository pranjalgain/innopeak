import { useEffect, useRef, useState } from "react";

import { NotificationService } from "@/app/_libs/services/notification.service";

const STREAM_URL = "/v1/notifications/stream";
/** Held (via the Web Locks API) by the one tab that owns the connection; every other tab waits for it and listens on the channel. */
const LOCK_NAME = "innopeak-notification-stream";
const CHANNEL_NAME = "innopeak-notifications";

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 60_000;
/** Random extra wait, so every tab that lost its stream in a deploy does not reconnect on the same tick. */
const RECONNECT_JITTER_MS = 4_000;
/** The server sends a heartbeat every 25s; a tab that hears nothing for this long assumes the owner is gone or disconnected. */
const OWNER_SILENT_MS = 60_000;
/** The owner's own watchdog: a stream that has been silent this long (a sleeping laptop, a middlebox) is dead even if no error fired. */
const STREAM_SILENT_MS = 60_000;

interface UseNotificationStreamOptions {
  enabled: boolean;
  /** Something new arrived for this user: refetch the feed. Called on a reconnect too, to catch up on anything missed while down. */
  onNotice: () => void;
  /** True when the feed was fetched moments ago, so a first connection needs no catch-up refetch. Without it every `ready` catches up. */
  isFeedFresh?: () => boolean;
}

/**
 * Keeps one server-sent-events stream open per browser and calls `onNotice` when the server says there is something new. The browser opens
 * the connection (an ordinary GET with the session cookie) and the server writes to it; nothing is installed and no permission is asked.
 *
 * One stream per browser, not per tab: the tab that gets the Web Lock opens it and relays what it hears to the others over a
 * `BroadcastChannel`; if that tab closes, a waiting tab takes over. Without the Web Locks API every tab opens its own (the server caps that).
 *
 * `EventSource` only reconnects by itself after a network drop, not after an HTTP error, so reconnecting is handled here: close, wait a
 * jittered backoff, make sure the session is still good (the stream ends when the 15-minute access token does), open again. Returns whether a stream is
 * believed to be up, so the caller can poll less often while it is.
 */
export function useNotificationStream(options: UseNotificationStreamOptions): {
  connected: boolean;
} {
  const { enabled, onNotice, isFeedFresh } = options;
  const [connected, setConnected] = useState(false);

  const onNoticeRef = useRef(onNotice);
  const isFeedFreshRef = useRef(isFeedFresh);
  useEffect(() => {
    onNoticeRef.current = onNotice;
    isFeedFreshRef.current = isFeedFresh;
  }, [onNotice, isFeedFresh]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;

    let disposed = false;
    let isOwner = false;
    let hasConnectedBefore = false;
    let attempt = 0;
    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let lastOwnerSignalAt = 0;
    let releaseLock: (() => void) | undefined;

    const abort = new AbortController();
    const channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
    const tell = (message: "alive" | "notice" | "down") => channel?.postMessage(message);

    let watchdog: number | undefined;
    const armWatchdog = () => {
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => {
        if (source !== null) drop(source);
      }, STREAM_SILENT_MS);
    };

    /** Shared by a real error and by the watchdog: close, report, and try again after a backoff. */
    const drop = (stream: EventSource) => {
      window.clearTimeout(watchdog);
      stream.close();
      if (source === stream) source = null;
      setConnected(false);
      tell("down");
      scheduleReconnect();
    };

    const open = () => {
      if (disposed) return;
      const stream = new EventSource(STREAM_URL, { withCredentials: true });
      source = stream;
      armWatchdog();

      stream.addEventListener("ready", () => {
        attempt = 0;
        setConnected(true);
        tell("alive");
        armWatchdog();
        // Anything created while no stream was open (a reconnect, a tab taking over) is picked up by refetching once. Told to the other
        // tabs too: they were waiting on this stream and would otherwise stay stale until their next poll.
        if (hasConnectedBefore || !(isFeedFreshRef.current?.() ?? false)) {
          onNoticeRef.current();
          tell("notice");
        }
        hasConnectedBefore = true;
      });
      stream.addEventListener("notification", () => {
        armWatchdog();
        onNoticeRef.current();
        tell("notice");
      });
      stream.addEventListener("heartbeat", () => {
        armWatchdog();
        tell("alive");
      });
      stream.onerror = () => drop(stream);
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      attempt += 1;
      const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(attempt, 6));
      reconnectTimer = window.setTimeout(
        () => {
          // One cheap authenticated read rather than an unconditional token refresh: if the access token is still good (a deploy, a network
          // blip) nothing is rotated, and if it expired (the normal end of a stream) the request layer renews it once, shared with any
          // other request or tab doing the same. Refreshing on every reconnect would have a deploy send every browser to the refresh route
          // at once, and that route is throttled per IP. A failure is not fatal: the stream opens anyway and the next attempt tries again.
          void NotificationService.list(0, 1)
            .catch(() => undefined)
            .finally(open);
        },
        backoff + Math.random() * RECONNECT_JITTER_MS,
      );
    };

    const becomeOwner = () => {
      isOwner = true;
      open();
    };

    if (channel !== null) {
      channel.onmessage = (event: MessageEvent<unknown>) => {
        if (isOwner) return;
        lastOwnerSignalAt = Date.now();
        if (event.data === "notice") {
          onNoticeRef.current();
          setConnected(true);
        } else if (event.data === "alive") {
          setConnected(true);
        } else if (event.data === "down") {
          setConnected(false);
        }
      };
    }
    // A tab that is not the owner learns the owner is gone by silence.
    const silenceCheck = window.setInterval(() => {
      if (!isOwner && lastOwnerSignalAt !== 0 && Date.now() - lastOwnerSignalAt > OWNER_SILENT_MS) {
        lastOwnerSignalAt = 0;
        setConnected(false);
      }
    }, OWNER_SILENT_MS / 2);

    if (typeof navigator !== "undefined" && "locks" in navigator) {
      void navigator.locks
        .request(LOCK_NAME, { signal: abort.signal }, () => {
          if (disposed) return undefined;
          // Holding the lock until cleanup is what keeps every other tab waiting.
          return new Promise<void>((resolve) => {
            releaseLock = resolve;
            becomeOwner();
          });
        })
        .catch(() => undefined);
    } else {
      becomeOwner();
    }

    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(watchdog);
      window.clearInterval(silenceCheck);
      source?.close();
      if (isOwner) channel?.postMessage("down");
      releaseLock?.();
      abort.abort();
      channel?.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
