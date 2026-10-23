import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";
import type { ConnectionInfo } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { ConnectionSettingsSection } from "../connection-settings-section";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

function location(id: string, businessName: string): ConnectedLocation {
  return {
    id,
    provider: "google",
    externalLocationId: `locations/${id}`,
    businessName,
    address: "214 Harbor St, Portland, ME",
    status: "active",
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastSyncStatus: "ok",
    lastSyncError: null,
    onboardingBackfillCompletedAt: "2026-01-01T00:00:00.000Z",
    billingPausedAt: null,
  };
}

const DOWNTOWN = location("loc-downtown", "The Coffee House — Downtown");
const UPTOWN = location("loc-uptown", "The Coffee House — Uptown");

function renderSection(connection: ConnectionInfo, onDisconnect = vi.fn().mockResolvedValue(true)) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConnectionSettingsSection connection={connection} onDisconnect={onDisconnect} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ConnectionSettingsSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([DOWNTOWN, UPTOWN]);
  });

  function mockActiveLocation(active: ConnectedLocation): void {
    const state: ConnectionState = {
      status: "connected",
      connectionId: "conn-1",
      providerAccountId: "accounts/1",
      connectedAt: "2026-01-01T00:00:00.000Z",
      location: active,
    };
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state);
  }

  /** Regression: after a header business switch the tile named the deselected location (stale ["settings"] copy) while the "other" list also showed it, and the active one appeared nowhere. */
  test("names the live active location, even when the settings copy is stale", async () => {
    mockActiveLocation(UPTOWN);

    renderSection({
      businessName: DOWNTOWN.businessName,
      lastSyncedAt: "2026-01-01T00:00:00.000Z",
      status: "connected",
    });

    expect(await screen.findByText(UPTOWN.businessName)).toBeInTheDocument();
    // Exactly once — as an "other" location, never also as the connected one.
    expect(screen.getAllByText(DOWNTOWN.businessName)).toHaveLength(1);
  });

  test("lists every other confirmed location alongside the active one", async () => {
    mockActiveLocation(DOWNTOWN);

    renderSection({
      businessName: DOWNTOWN.businessName,
      lastSyncedAt: "2026-01-01T00:00:00.000Z",
      status: "connected",
    });

    expect(await screen.findByText("Other connected locations")).toBeInTheDocument();
    expect(screen.getByText(UPTOWN.businessName)).toBeInTheDocument();
    expect(screen.getAllByText(DOWNTOWN.businessName)).toHaveLength(1);
  });

  // The screen used to navigate away before the request finished, so a failed disconnect sent the owner to onboarding while still connected.
  describe("disconnecting", () => {
    const connected: ConnectionInfo = {
      businessName: DOWNTOWN.businessName,
      lastSyncedAt: "2026-01-01T00:00:00.000Z",
      status: "connected",
    };

    async function confirmDisconnect(onDisconnect: () => Promise<boolean>) {
      mockActiveLocation(DOWNTOWN);
      push.mockClear();
      renderSection(connected, vi.fn(onDisconnect));
      fireEvent.click(await screen.findByRole("button", { name: messages.settings.connection.disconnectButton }));
      fireEvent.click(await screen.findByRole("button", { name: messages.settings.connection.disconnectButton }));
    }

    test("leaves for onboarding only once the disconnect has gone through", async () => {
      await confirmDisconnect(() => Promise.resolve(true));

      await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/connect"));
    });

    test("stays on the screen when the disconnect fails", async () => {
      const failing = vi.fn(() => Promise.resolve(false));
      await confirmDisconnect(failing);

      await waitFor(() => expect(failing).toHaveBeenCalledOnce());
      expect(push).not.toHaveBeenCalled();
    });
  });
});
