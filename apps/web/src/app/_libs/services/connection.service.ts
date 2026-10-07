import { refreshSession } from "@/app/_libs/api-sdk/config";
import { connectionsApi, connectionsSyncApi } from "@/app/_libs/api-sdk/connections-api";
import { unwrap } from "@/app/_libs/services/api-error";

/** Three states, not two: `needs_reauth` (broken-but-present) must not collapse into `connected`, so the dashboard guard can show a reconnect banner. */
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
  /** Set when a plan downgrade left this location over the cap: still a live connection but excluded from the 15-minute poll until a plan change or `PUT /v1/billing/active-location` clears it. `null` = active under the cap. Populated only on `GET /v1/connections/locations` rows. */
  billingPausedAt: string | null;
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

interface ConfirmLocationsResponse {
  locations: ConfirmLocationResponse[];
}

interface PersistedLocationResponse extends Omit<ConnectedLocation, "businessName"> {
  name: string;
}

/** Single source of truth for "is this tenant connected"; not a `localStorage` flag, which is wrong on a fresh browser. */
export class ConnectionService {
  static async getState(signal?: AbortSignal): Promise<ConnectionState> {
    const apiResponse = await connectionsApi.connectionsControllerGetConnectionV1({ signal });
    const response = unwrap<ConnectionStatusResponse>(apiResponse.data);

    return {
      // Flattened here so no component has to know `connected` and `connectionStatus` are separate facts; `needs_reauth` stays its own state.
      status: this.resolveStatus(response),
      connectionId: response.connection?.id ?? null,
      providerAccountId: response.connection?.providerAccountId ?? null,
      connectedAt: response.connection?.connectedAt ?? null,
      location: response.location,
    };
  }

  /**
   * Full browser navigation (OAuth grant); the access-token cookie authenticates it without a Bearer header. The refresh first
   * is best-effort but load-bearing: the cookie lives 15 minutes and a 401 navigation lands on a raw JSON error page.
   */
  static async startAuthorize(returnTo: "onboarding" | "settings" = "onboarding"): Promise<void> {
    await refreshSession().catch(() => false);
    // Not a Next page: `/v1/*` is rewritten to the backend, which 302s to Google; `router.push` would try to resolve a nonexistent route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/v1/connections/google/authorize?returnTo=${returnTo}`);
  }

  static async listAvailableLocations(signal?: AbortSignal): Promise<AvailableLocation[]> {
    const apiResponse = await connectionsApi.connectionsControllerAvailableLocationsV1({ signal });
    const response = unwrap<{ locations: AvailableLocation[] }>(apiResponse.data);

    return response.locations;
  }

  static async confirmLocations(externalLocationIds: string[]): Promise<ConfirmedLocation[]> {
    const apiResponse = await connectionsApi.connectionsControllerConfirmLocationV1({
      confirmLocationDto: { externalLocationIds },
    });
    const response = unwrap<ConfirmLocationsResponse>(apiResponse.data);

    return response.locations.map(({ name, ...rest }) => ({ ...rest, businessName: name }));
  }

  /** Every confirmed location, active or not: onboarding resume must find those whose backfill still needs polling, and `GET /v1/connections` reports only the selected one. */
  static async listLocations(signal?: AbortSignal): Promise<ConnectedLocation[]> {
    const apiResponse = await connectionsApi.connectionsControllerListLocationsV1(
      {},
      { signal },
    );
    const response = unwrap<{ locations: PersistedLocationResponse[] }>(apiResponse.data);

    return response.locations.map(({ name, ...rest }) => ({ ...rest, businessName: name }));
  }

  /** The tenant-wide "currently viewed" business (`tenants.active_location_id`), shared by all members. Owner-only server-side (a member gets 403); not pre-checked here. */
  static async setActiveLocation(locationId: string): Promise<ConnectedLocation> {
    const apiResponse = await connectionsApi.connectionsControllerSetActiveLocationV1({
      setActiveLocationDto: { locationId },
    });
    const response = unwrap<PersistedLocationResponse>(apiResponse.data);
    const { name, ...rest } = response;
    return { ...rest, businessName: name };
  }

  static async getBackfillProgress(
    locationId: string,
    signal?: AbortSignal,
  ): Promise<BackfillProgress> {
    const apiResponse = await connectionsSyncApi.connectionsSyncControllerGetBackfillV1(
      { locationId },
      { signal },
    );
    return unwrap<BackfillProgress>(apiResponse.data);
  }

  static async disconnect(): Promise<{
    deactivatedLocationIds: string[];
    credentialRevoked: boolean;
  }> {
    const apiResponse = await connectionsApi.connectionsControllerDisconnectV1();
    return unwrap(apiResponse.data);
  }

  private static resolveStatus(response: ConnectionStatusResponse): ConnectionStatus {
    if (!response.connection) return "disconnected";
    if (response.connection.connectionStatus === "needs_reauth") return "needs_reauth";
    return response.connected ? "connected" : "disconnected";
  }
}
