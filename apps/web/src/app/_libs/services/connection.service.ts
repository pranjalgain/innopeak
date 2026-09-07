import { ApiClient } from "./api-client";

/**
 * Three states, not two.
 *
 * The old `ConnectionStatus` union was `connected | disconnected`, but the backend's
 * `google_connection_status` is `active | needs_reauth` — a broken-but-present connection had no
 * faithful representation, and collapsing `needs_reauth` into `connected` hides precisely the
 * failure that enum value exists to surface. Widening it here is what lets the dashboard guard
 * render a reconnect banner instead of either blanking the app or pretending everything is fine.
 */
export type ConnectionStatus = "connected" | "disconnected" | "needs_reauth";

export interface ConnectedLocation {
  id: string;
  provider: "google";
  externalLocationId: string;
  businessName: string;
  address: string | null;
  status: "active" | "inactive";
  lastSyncedAt: string | null;
  lastSyncStatus: "ok" | "error" | null;
  lastSyncError: string | null;
  onboardingBackfillCompletedAt: string | null;
}

export interface ConnectionState {
  status: ConnectionStatus;
  connectionId: string | null;
  providerAccountId: string | null;
  connectedAt: string | null;
  location: ConnectedLocation | null;
}

export interface AvailableLocation {
  externalLocationId: string;
  name: string;
  address: string | null;
  alreadyConnected: boolean;
}

export interface BackfillProgress {
  locationId: string;
  syncRunId: string | null;
  status: "running" | "ok" | "error" | null;
  reviewsFetched: number | null;
  /** Null when the provider reported no total — the UI must show an indeterminate bar, not a guess. */
  totalToImport: number | null;
  /** 0-100, or null. Never synthesized. */
  progress: number | null;
  errorMessage: string | null;
  isStale: boolean;
  /** The ONLY correct signal for advancing to "done" — see the backfill endpoint's contract. */
  livePollingEnabled: boolean;
}

export interface ConfirmedLocation extends ConnectedLocation {
  backfill: { syncRunId: string; status: string; startedAt: string } | null;
  backfillAlreadyRunning: boolean;
}

/** The raw backend shape, before it is flattened at this boundary. */
interface ConnectionStatusResponse {
  connected: boolean;
  status: "connected" | "disconnected";
  connection: {
    id: string;
    provider: "google";
    providerAccountId: string;
    connectionStatus: "active" | "needs_reauth";
    connectedAt: string;
  } | null;
  location: ConnectedLocation | null;
}

interface ConfirmLocationResponse extends Omit<ConnectedLocation, "businessName"> {
  name: string;
  backfill: { syncRunId: string; status: string; startedAt: string } | null;
  backfillAlreadyRunning: boolean;
}

/**
 * The single source of truth for "is this tenant connected".
 *
 * Replaces `GoogleConnectionService`, which read a `localStorage` flag. That flag disagreed with
 * the real `hasConnectedBusiness` the login response already carried, so a genuinely connected
 * tenant signing in from a fresh browser — a new laptop, a private window, after clearing site
 * data — was bounced back through onboarding with no way to tell they were already set up.
 */
export class ConnectionService {
  static async getState(signal?: AbortSignal): Promise<ConnectionState> {
    const response = await ApiClient.request<ConnectionStatusResponse>("/v1/connections", {
      signal,
    });

    return {
      // Flattened at this boundary so no component has to know that `connected` and
      // `connectionStatus` are two different facts. `needs_reauth` deliberately survives as its
      // own state rather than collapsing into "disconnected".
      status: this.resolveStatus(response),
      connectionId: response.connection?.id ?? null,
      providerAccountId: response.connection?.providerAccountId ?? null,
      connectedAt: response.connection?.connectedAt ?? null,
      location: response.location,
    };
  }

  /**
   * A full browser navigation, not fetch: this is an OAuth grant, so the browser has to actually
   * travel to Google and come back through our callback. The access token rides along in its
   * httpOnly cookie (scoped `/`), and `/v1/*` is rewritten to the backend by `next.config.ts`, so
   * the request is authenticated without a Bearer header and without a popup.
   *
   * The refresh first is best-effort but load-bearing: the access-token cookie lives 15 minutes,
   * and a navigation that 401s lands the user on a raw JSON error page rather than a screen.
   */
  static async startAuthorize(returnTo: "onboarding" | "settings" = "onboarding"): Promise<void> {
    await ApiClient.refreshSession().catch(() => false);
    // Not a Next page: `/v1/*` is rewritten to the NestJS backend, which answers with a 302 to
    // Google's consent screen. `router.push` would ask the Next router to resolve a route that
    // does not exist in the app, and the browser must genuinely leave the origin for OAuth at all.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/v1/connections/google/authorize?returnTo=${returnTo}`);
  }

  static async listAvailableLocations(signal?: AbortSignal): Promise<AvailableLocation[]> {
    const response = await ApiClient.request<{ locations: AvailableLocation[] }>(
      "/v1/connections/google/available-locations",
      { signal },
    );

    return response.locations;
  }

  static async confirmLocation(externalLocationId: string): Promise<ConfirmedLocation> {
    const response = await ApiClient.request<ConfirmLocationResponse>("/v1/connections/locations", {
      method: "POST",
      body: { externalLocationId },
    });

    const { name, ...rest } = response;
    return { ...rest, businessName: name };
  }

  static getBackfillProgress(locationId: string, signal?: AbortSignal): Promise<BackfillProgress> {
    return ApiClient.request<BackfillProgress>(
      `/v1/connections/locations/${locationId}/backfill`,
      { signal },
    );
  }

  static disconnect(): Promise<{ deactivatedLocationIds: string[]; credentialRevoked: boolean }> {
    return ApiClient.request("/v1/connections/google", { method: "DELETE" });
  }

  private static resolveStatus(response: ConnectionStatusResponse): ConnectionStatus {
    if (!response.connection) return "disconnected";
    if (response.connection.connectionStatus === "needs_reauth") return "needs_reauth";
    return response.connected ? "connected" : "disconnected";
  }
}
