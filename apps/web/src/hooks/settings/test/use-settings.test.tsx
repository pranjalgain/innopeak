import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { PlatformSettingsService } from "@/app/_libs/services/platform-settings.service";
import { SettingsService } from "@/app/_libs/services/settings.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import { platformSettingsQueryKey } from "@/hooks/common/use-platform-settings";
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
    // The settings query waits for the platform settings; off by default, like the platform.
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      microsoftLoginEnabled: true,
      passwordLoginEnabled: true,
      googleLoginEnabled: true,
      inviteMembersEnabled: true,
      notificationSettingsEnabled: false,
    });
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "acct-1",
      connectedAt: "2026-01-01T00:00:00Z",
      location: null,
    });
  });

  /** Regression: the success toast fired before the persist settled, so a failed write showed a false "updated" toast first. */
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

describe("useSettings — overlapping saves", () => {
  beforeEach(() => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue({
      microsoftLoginEnabled: true,
      passwordLoginEnabled: true,
      googleLoginEnabled: true,
      inviteMembersEnabled: true,
      notificationSettingsEnabled: false,
    });
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "acct-1",
      connectedAt: "2026-01-01T00:00:00Z",
      location: null,
    });
  });

  // The endpoint replaces all four fields. Two saves of different fields must run one after the other, the second starting from what the
  // first left behind, or whichever finishes last writes the other's field back to its old value.
  test("sends the second save on top of the first when two saves of different fields overlap", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(settings());
    const update = vi.spyOn(SettingsService, "updateGeneralSettings").mockResolvedValue(undefined as never);

    const client = createQueryClient();
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useSettings(), { wrapper: sharedWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.saveGeneral({ escalationRatingThreshold: 2 });
      second = result.current.saveGeneral({ aiReplyCount: 1 });
    });
    await act(async () => {
      await Promise.all([first, second]);
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]?.[0]).toMatchObject({ escalationRatingThreshold: 2, aiReplyCount: 1 });
    await waitFor(() =>
      expect(result.current.settings?.general).toMatchObject({
        escalationRatingThreshold: 2,
        aiReplyCount: 1,
      }),
    );
  });

  // The General tab's draft is taken at mount and now outlives visits to the AI tab.
  test("a General-tab save does not send back an AI reply count it never edited", async () => {
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(settings());
    const update = vi.spyOn(SettingsService, "updateGeneralSettings").mockResolvedValue(undefined as never);
    const client = createQueryClient();
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useSettings(), { wrapper: sharedWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.saveGeneral({ aiReplyCount: 1 });
    });
    await act(async () => {
      // What `GeneralSettingsSection` sends: its own three fields only.
      await result.current.saveGeneral({ escalationRatingThreshold: 2 });
    });

    expect(update.mock.calls[1]?.[0]).toMatchObject({ aiReplyCount: 1, escalationRatingThreshold: 2 });
  });
});

describe("useSettings — notification recipients follow the platform setting", () => {
  beforeEach(() => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "acct-1",
      connectedAt: "2026-01-01T00:00:00Z",
      location: null,
    });
  });

  const platform = (notificationSettingsEnabled: boolean) => ({
    microsoftLoginEnabled: true,
    passwordLoginEnabled: true,
    googleLoginEnabled: true,
    inviteMembersEnabled: true,
    notificationSettingsEnabled,
  });

  test.each([false, true])("asks the service for recipients only when the setting is on (%s)", async (enabled) => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue(platform(enabled));
    const getSettings = vi.spyOn(SettingsService, "getSettings").mockResolvedValue(settings());

    const { result } = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSettings).toHaveBeenCalledWith(expect.any(Function), enabled);
  });

  // Regression: the recipients list was read once, through the cache, and a flag that changed afterwards left an empty list cached as "none".
  test("loads again, with recipients, when the platform turns the setting on while Settings is open", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockResolvedValue(platform(false));
    const getSettings = vi.spyOn(SettingsService, "getSettings").mockResolvedValue(settings());
    const client = createQueryClient();
    const sharedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages}>
          {children}
        </NextIntlClientProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useSettings(), { wrapper: sharedWrapper });
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(getSettings).toHaveBeenLastCalledWith(expect.any(Function), false);

    act(() => {
      client.setQueryData(platformSettingsQueryKey, platform(true));
    });

    await waitFor(() => expect(getSettings).toHaveBeenLastCalledWith(expect.any(Function), true));
  });

  test("treats unreadable platform settings as off", async () => {
    vi.spyOn(PlatformSettingsService, "get").mockRejectedValue(new Error("network"));
    const getSettings = vi.spyOn(SettingsService, "getSettings").mockResolvedValue(settings());

    const { result } = renderHook(() => useSettings(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(getSettings).toHaveBeenCalledWith(expect.any(Function), false);
  });
});
