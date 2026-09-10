import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ROUTES } from "@/app/_libs/constants/routes";
import { ApiError } from "@/app/_libs/services/api-error";
import { ConnectionService, type ConnectionState } from "@/app/_libs/services/connection.service";

import { ConnectionGuard } from "../connection-guard";
import messages from "../../../../../messages/en.json";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

function state(overrides: Partial<ConnectionState> = {}): ConnectionState {
  return {
    status: "connected",
    connectionId: "conn-1",
    providerAccountId: "accounts/1",
    connectedAt: "2026-01-01T00:00:00.000Z",
    location: null,
    ...overrides,
  };
}

function renderGuard() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ConnectionGuard>
        <p>Dashboard content</p>
      </ConnectionGuard>
    </NextIntlClientProvider>,
  );
}

describe("ConnectionGuard", () => {
  beforeEach(() => {
    replace.mockClear();
    vi.restoreAllMocks();
  });

  test("renders the dashboard for a connected tenant", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state());

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("redirects a disconnected tenant to onboarding", async () => {
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state({ status: "disconnected" }));

    renderGuard();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ROUTES.ONBOARDING_CONNECT));
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  test("renders the dashboard with a reconnect banner when the grant expired", async () => {
    // Blanking a paying tenant's dashboard because a refresh token expired reads as data loss —
    // their reviews and history are all still there, only ingestion of new ones is broken.
    vi.spyOn(ConnectionService, "getState").mockResolvedValue(state({ status: "needs_reauth" }));

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("fails open on a server error rather than ejecting the user into onboarding", async () => {
    // A transient 5xx must not look like "you never connected". A genuine 401 is handled upstream
    // (ApiClient clears the token, RequireAuth redirects), so failing open cannot mask an auth
    // failure.
    vi.spyOn(ConnectionService, "getState").mockRejectedValue(new ApiError(503, "Unavailable"));

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("fails open on a network failure", async () => {
    vi.spyOn(ConnectionService, "getState").mockRejectedValue(new TypeError("Failed to fetch"));

    renderGuard();

    expect(await screen.findByText("Dashboard content")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  test("shows a skeleton, not the dashboard, while the check is in flight", () => {
    vi.spyOn(ConnectionService, "getState").mockReturnValue(new Promise(() => undefined));

    renderGuard();

    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });
});
