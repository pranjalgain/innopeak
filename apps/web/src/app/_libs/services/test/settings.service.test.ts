import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectionService } from "@/app/_libs/services/connection.service";
import { SettingsService } from "@/app/_libs/services/settings.service";
import type { GeneralSettings } from "@/types/domain";

const GENERAL: GeneralSettings = {
  escalationRatingThreshold: 3,
  autoPostApprovedReplies: false,
  reviewDataRetentionMonths: 24,
  aiReplyCount: 2,
};

function stubSources() {
  vi.spyOn(SettingsService, "listBlocklistTerms").mockResolvedValue([]);
  vi.spyOn(SettingsService, "getGeneralSettings").mockResolvedValue(GENERAL);
  vi.spyOn(SettingsService, "listNotificationRecipients").mockResolvedValue([]);
}

describe("SettingsService.getSettings — connection tile", () => {
  beforeEach(() => stubSources());
  afterEach(() => vi.restoreAllMocks());

  it("reports the live connection, not sample data", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "accounts/1",
      connectedAt: "2026-01-01T00:00:00.000Z",
      location: {
        businessName: "Bhojon Bilas",
        lastSyncedAt: "2026-10-09T12:00:00.000Z",
      } as never,
    });

    const { connection } = await SettingsService.getSettings();

    expect(connection).toEqual({
      status: "connected",
      businessName: "Bhojon Bilas",
      lastSyncedAt: "2026-10-09T12:00:00.000Z",
    });
  });

  // Regression: an unreadable connection state fell back to a hard-coded sample business ("The Coastal Table").
  it("shows nothing connected, and invents no business, when the state cannot be read", async () => {
    vi.spyOn(ConnectionService, "getState").mockRejectedValue(new Error("network"));

    const { connection } = await SettingsService.getSettings();

    expect(connection).toEqual({ status: "disconnected", businessName: null, lastSyncedAt: null });
  });

  it("shows a connected business that has not synced yet without a made-up date", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "accounts/1",
      connectedAt: "2026-01-01T00:00:00.000Z",
      location: { businessName: "Bhojon Bilas", lastSyncedAt: null } as never,
    });

    const { connection } = await SettingsService.getSettings();

    expect(connection.lastSyncedAt).toBeNull();
  });
});

describe("SettingsService.getSettings — notification recipients", () => {
  beforeEach(() => {
    stubSources();
    vi.spyOn(ConnectionService, "getState").mockResolvedValue({
      status: "disconnected",
      connectionId: null,
      providerAccountId: null,
      connectedAt: null,
      location: null,
    } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  // The recipients route answers 403 while the platform setting is off, so asking for it would fail the whole Settings load.
  it("does not request recipients unless the platform's notification settings are on", async () => {
    const { notificationRecipients } = await SettingsService.getSettings();

    expect(SettingsService.listNotificationRecipients).not.toHaveBeenCalled();
    expect(notificationRecipients).toEqual([]);
  });

  it("requests recipients when the notification settings are on", async () => {
    vi.spyOn(SettingsService, "listNotificationRecipients").mockResolvedValue([
      { id: "r1", name: "Jane Doe", initials: "JD", channel: "email", isActive: true },
    ]);

    const { notificationRecipients } = await SettingsService.getSettings(
      () => ConnectionService.getState(),
      true,
    );

    expect(notificationRecipients).toHaveLength(1);
  });
});
