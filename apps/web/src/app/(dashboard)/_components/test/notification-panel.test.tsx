import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { NotificationService } from "@/app/_libs/services/notification.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { NOTIFICATIONS_POLL_MS } from "@/hooks/notifications/use-notifications";
import { NOTIFICATIONS_FIXTURE } from "@/test/fixtures/notifications";

import messages from "../../../../../messages/en.json";
import { NotificationPanel } from "../notification-panel";


vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeAll(() => {
  // jsdom implements neither, and Radix Popover needs both.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.scrollIntoView = vi.fn();
});

// Pages through `NOTIFICATIONS_FIXTURE` so the test covers the panel's paging, not the backend call.
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

function renderPanel() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <NotificationPanel />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("NotificationPanel", () => {
  test("keeps loading pages while the list does not overflow its container", async () => {
    // Regression: paging driven only by `onScroll` never fired when page one fit the box. jsdom's zero-height elements reproduce that.
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: messages.appShell.notifications }));

    await waitFor(() => {
      expect(screen.getByText("Google sync delayed")).toBeInTheDocument();
    });
    expect(screen.getByText("Review escalated")).toBeInTheDocument();
    expect(screen.getByText("Reply sent")).toBeInTheDocument();

    expect(screen.queryByText(messages.appShell.notificationPanel.loadingMore)).not.toBeInTheDocument();
  });

  // The backend can ship a new notification type before this build knows it; that used to throw inside the header.
  test("renders a notification of a type it does not know instead of crashing the shell", async () => {
    const [first, ...rest] = structuredClone(NOTIFICATIONS_FIXTURE);
    const unknown = { ...first!, id: "n-unknown", title: "Something new", type: "a_future_type" } as never;
    vi.spyOn(NotificationService, "list").mockResolvedValue({
      items: [unknown, ...rest],
      hasMore: false,
      unreadTotal: 1,
    });
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /^Notifications/ }));

    expect(await screen.findByText("Something new")).toBeInTheDocument();
  });

  describe("when a new notification arrives", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    const flush = (ms = 50) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });

    test("shakes the bell, pulses the dot and announces it to screen readers", async () => {
      vi.useFakeTimers();
      const unreadNow = NOTIFICATIONS_FIXTURE.filter((notification) => !notification.isRead).length;
      let unreadOnServer = unreadNow;
      vi.spyOn(NotificationService, "list").mockImplementation(async (offset, limit) => ({
        items: structuredClone(NOTIFICATIONS_FIXTURE).slice(offset, offset + limit),
        hasMore: offset + limit < NOTIFICATIONS_FIXTURE.length,
        unreadTotal: unreadOnServer,
      }));
      const { container } = renderPanel();
      for (let attempt = 0; attempt < 20 && container.querySelector("span.bg-destructive") === null; attempt += 1) {
        await flush();
      }

      // Opening the page with unread notices is not news: nothing moves.
      expect(container.querySelector(".animate-bell-ring")).toBeNull();

      unreadOnServer += 1;
      await flush(NOTIFICATIONS_POLL_MS);
      for (let attempt = 0; attempt < 20 && container.querySelector(".animate-bell-ring") === null; attempt += 1) {
        await flush();
      }

      expect(container.querySelector(".animate-bell-ring")).not.toBeNull();
      expect(container.querySelector(".animate-badge-pulse")).not.toBeNull();
      expect(screen.getByRole("status")).toHaveTextContent("1 new notification");
    });

    // Regression: the bell and the dot shared one `key`, so every ring could leave the previous bell behind on screen.
    test("keeps exactly one bell and one dot however many notices ring it", async () => {
      vi.useFakeTimers();
      let unreadOnServer = NOTIFICATIONS_FIXTURE.filter((notification) => !notification.isRead).length;
      vi.spyOn(NotificationService, "list").mockImplementation(async (offset, limit) => ({
        items: structuredClone(NOTIFICATIONS_FIXTURE).slice(offset, offset + limit),
        hasMore: offset + limit < NOTIFICATIONS_FIXTURE.length,
        unreadTotal: unreadOnServer,
      }));
      const { container } = renderPanel();
      for (let attempt = 0; attempt < 20 && container.querySelector("span.bg-destructive") === null; attempt += 1) {
        await flush();
      }

      for (let ring = 0; ring < 3; ring += 1) {
        unreadOnServer += 1;
        await flush(NOTIFICATIONS_POLL_MS);
        for (let attempt = 0; attempt < 20; attempt += 1) await flush();
      }

      const trigger = screen.getByRole("button", { name: /^Notifications/ });
      expect(trigger.querySelectorAll("svg")).toHaveLength(1);
      expect(container.querySelectorAll("span.bg-destructive")).toHaveLength(1);
    });
  });
});
