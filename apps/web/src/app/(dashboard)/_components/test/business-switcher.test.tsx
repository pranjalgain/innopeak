import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  type ConnectedLocation,
  ConnectionService,
  type ConnectionState,
} from "@/app/_libs/services/connection.service";
import { createQueryClient } from "@/app/_libs/utils/query-client";

import messages from "../../../../../messages/en.json";
import { BusinessSwitcher } from "../business-switcher";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function location(overrides: Partial<ConnectedLocation> = {}): ConnectedLocation {
  return {
    id: "loc-1",
    provider: "google",
    externalLocationId: "locations/1",
    businessName: "Downtown Store",
    address: null,
    status: "active",
    lastSyncedAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    onboardingBackfillCompletedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function connectionState(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    status: "connected",
    connectionId: "conn-1",
    providerAccountId: "accounts/1",
    connectedAt: "2026-01-01T00:00:00.000Z",
    location: location(),
    ...overrides,
  };
}

function renderSwitcher() {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <BusinessSwitcher />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BusinessSwitcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("renders nothing for a single-location tenant — there is no choice to make", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(connectionState());
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([location()]);

    renderSwitcher();

    // Give the queries a tick to settle, then assert nothing rendered.
    await waitFor(() => expect(ConnectionService.listLocations).toHaveBeenCalled());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("renders nothing while disconnected — no locations to list at all", () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ status: "disconnected", connectionId: null, location: null }),
    );
    const listLocations = vi.spyOn(ConnectionService, "listLocations");

    renderSwitcher();

    expect(listLocations).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("shows the active location's name on the trigger once there are several to choose from", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ location: location({ id: "loc-1", businessName: "Downtown Store" }) }),
    );
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([
      location({ id: "loc-1", businessName: "Downtown Store" }),
      location({ id: "loc-2", businessName: "Uptown Store" }),
    ]);

    renderSwitcher();

    expect(await screen.findByRole("button", { name: /switch business/i })).toHaveTextContent(
      "Downtown Store",
    );
  });

  test("marks the currently active location with a checkmark in the menu", async () => {
    const user = userEvent.setup();
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ location: location({ id: "loc-1", businessName: "Downtown Store" }) }),
    );
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([
      location({ id: "loc-1", businessName: "Downtown Store" }),
      location({ id: "loc-2", businessName: "Uptown Store" }),
    ]);

    renderSwitcher();
    await user.click(await screen.findByRole("button", { name: /switch business/i }));

    const activeItem = await screen.findByRole("menuitem", { name: /downtown store/i });
    const otherItem = screen.getByRole("menuitem", { name: /uptown store/i });
    // Radix renders the check icon as a sibling within the item — presence of the svg is the
    // simplest faithful signal here, since the icon carries no accessible name of its own.
    expect(activeItem.querySelector("svg")).not.toBeNull();
    expect(otherItem.querySelector("svg")).toBeNull();
  });

  test("picking a different location switches it and updates the trigger", async () => {
    const user = userEvent.setup();
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ location: location({ id: "loc-1", businessName: "Downtown Store" }) }),
    );
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([
      location({ id: "loc-1", businessName: "Downtown Store" }),
      location({ id: "loc-2", businessName: "Uptown Store" }),
    ]);
    const setActiveLocation = vi
      .spyOn(ConnectionService, "setActiveLocation")
      .mockResolvedValue(location({ id: "loc-2", businessName: "Uptown Store" }));

    renderSwitcher();
    await user.click(await screen.findByRole("button", { name: /switch business/i }));
    await user.click(await screen.findByRole("menuitem", { name: /uptown store/i }));

    expect(setActiveLocation).toHaveBeenCalledWith("loc-2");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /switch business/i })).toHaveTextContent(
        "Uptown Store",
      ),
    );
  });

  test("shows an error toast and leaves the selection unchanged when the switch fails", async () => {
    const { toast } = await import("sonner");
    const user = userEvent.setup();
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(
      connectionState({ location: location({ id: "loc-1", businessName: "Downtown Store" }) }),
    );
    vi.spyOn(ConnectionService, "listLocations").mockResolvedValue([
      location({ id: "loc-1", businessName: "Downtown Store" }),
      location({ id: "loc-2", businessName: "Uptown Store" }),
    ]);
    // A member hitting the owner-only endpoint, or any other failure — the trigger must not
    // silently drift to a location the write never actually persisted.
    vi.spyOn(ConnectionService, "setActiveLocation").mockRejectedValue(new Error("Forbidden"));

    renderSwitcher();
    await user.click(await screen.findByRole("button", { name: /switch business/i }));
    await user.click(await screen.findByRole("menuitem", { name: /uptown store/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /switch business/i })).toHaveTextContent(
      "Downtown Store",
    );
  });
});
