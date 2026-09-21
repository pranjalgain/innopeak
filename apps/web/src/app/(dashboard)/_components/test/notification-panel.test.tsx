import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { MOCK_NOTIFICATIONS } from "@/app/_libs/mock-data/notifications";
import { NotificationService } from "@/app/_libs/services/notification.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../../messages/en.json";
import { NotificationPanel } from "../notification-panel";


vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeAll(() => {
  // Radix Popover needs these; jsdom implements neither.
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.scrollIntoView = vi.fn();
});

// `NotificationService.list` is a real backend call now — this component test is about the
// panel's own rendering/paging, not the service, so this reproduces exactly what the service
// used to do by itself (page through `MOCK_NOTIFICATIONS`).
beforeEach(() => {
  vi.spyOn(NotificationService, "list").mockImplementation(async (offset, limit) => {
    const items = structuredClone(MOCK_NOTIFICATIONS).slice(offset, offset + limit);
    return {
      items,
      hasMore: offset + limit < MOCK_NOTIFICATIONS.length,
      unreadTotal: MOCK_NOTIFICATIONS.filter((notification) => !notification.isRead).length,
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
    // The regression this guards: paging was driven only by `onScroll`, so a first page that
    // fits inside the 320px box produced no scroll event, never called `fetchNextPage`, and left
    // every later notification unreachable behind a spinner. jsdom reports every element as
    // zero-height, which is exactly that "nothing to scroll" case.
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: messages.appShell.notifications }));

    // All five mock notifications, not just the first page of three.
    await waitFor(() => {
      expect(screen.getByText("Google sync delayed")).toBeInTheDocument();
    });
    expect(screen.getByText("Review escalated")).toBeInTheDocument();
    expect(screen.getByText("Reply sent")).toBeInTheDocument();

    // And it stops once the feed runs out, rather than spinning forever.
    expect(screen.queryByText(messages.appShell.notificationPanel.loadingMore)).not.toBeInTheDocument();
  });
});
