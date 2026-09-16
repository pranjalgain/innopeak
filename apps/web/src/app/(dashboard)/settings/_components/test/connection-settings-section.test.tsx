import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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
  };
}

const DOWNTOWN = location("loc-downtown", "The Coffee House — Downtown");
const UPTOWN = location("loc-uptown", "The Coffee House — Uptown");

function renderSection(connection: ConnectionInfo) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ConnectionSettingsSection connection={connection} onDisconnect={vi.fn()} />
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

  /**
   * Regression: the tile's name came from the `["settings"]` query while the "other locations"
   * list excluded by id from `["connection"]` — two separate cached copies of the same server
   * state. Switching business from the header's BusinessSwitcher writes only `["connection"]`, so
   * until Settings happened to refetch (5-minute staleTime, no refetch on focus) the tile still
   * named the location that had just been deselected — which the list, now excluding the NEW
   * active one, also listed. The same store rendered twice, and the genuinely active one nowhere.
   */
  test("names the live active location, even when the settings copy is stale", async () => {
    mockActiveLocation(UPTOWN);

    // What the stale `["settings"]` cache still says: the previously-active location.
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
});
