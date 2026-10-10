import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

import { NOTIFICATIONS_FIXTURE } from "@/test/fixtures/notifications";
import { NotificationService } from "@/app/_libs/services/notification.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

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
});
