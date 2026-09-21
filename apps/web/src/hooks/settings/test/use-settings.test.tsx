import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { SettingsService } from "@/app/_libs/services/settings.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { SettingsData } from "@/types/domain";

import messages from "../../../../messages/en.json";
import { useSettings } from "../use-settings";

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

function settings(overrides: Partial<SettingsData> = {}): SettingsData {
  return {
    general: {
      escalationRatingThreshold: 3,
      autoPostApprovedReplies: false,
      reviewDataRetentionMonths: null,
      aiReplyCount: 3,
    },
    blocklistTerms: [],
    notificationRecipients: [
      { id: "recipient-1", name: "Jane Doe", initials: "JD", channel: "email", isActive: true },
    ],
    connection: { businessName: "The Coffee House", lastSyncedAt: "2026-01-01T00:00:00Z", status: "connected" },
    ...overrides,
  };
}

describe("useSettings", () => {
  beforeEach(() => {
    toast.error.mockClear();
    toast.success.mockClear();
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "acct-1",
      connectedAt: "2026-01-01T00:00:00Z",
      location: null,
    });
  });

  /**
   * Regression: `updateRecipientChannel`/`toggleRecipientActive` used to call `toast.success`
   * unconditionally, right after kicking off the background persist — so a persist that went on to
   * fail still showed a false "updated" toast a moment before the real `updateFailed` error toast.
   * The fix moves the success toast into the mutation's own `onSuccess`, so it only fires once the
   * write actually confirms.
   */
  test("does not show a success toast when the background persist fails", async () => {
    const original = settings();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(original);
    vi.spyOn(SettingsService, "updateNotificationRecipient").mockRejectedValue(
      new Error("network error"),
    );

    const { result } = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleRecipientActive("recipient-1");
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.success).not.toHaveBeenCalled();
  });

  test("shows the success toast only once the background persist actually succeeds", async () => {
    const original = settings();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(original);
    let resolvePersist!: (recipient: SettingsData["notificationRecipients"][number]) => void;
    vi.spyOn(SettingsService, "updateNotificationRecipient").mockReturnValue(
      new Promise((resolve) => {
        resolvePersist = resolve;
      }),
    );

    const { result } = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.toggleRecipientActive("recipient-1");
    });

    // The optimistic write already applied, but the persist hasn't settled yet.
    expect(toast.success).not.toHaveBeenCalled();

    await act(async () => {
      resolvePersist({ ...original.notificationRecipients[0]!, isActive: false });
    });

    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
