import { connectionsApi, connectionsSyncApi } from "@/app/_libs/api-sdk/connections-api";
import { unwrap } from "@/app/_libs/services/api-error";

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

interface ConfirmLocationsResponse {
  locations: ConfirmLocationResponse[];
}

/** The raw backend shape for one row of `GET /v1/connections/locations`. */
interface PersistedLocationResponse extends Omit<ConnectedLocation, "businessName"> {
  name: string;
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
    const apiResponse = await connectionsApi.connectionsControllerGetConnectionV1({ signal });
    const response = unwrap<ConnectionStatusResponse>(apiResponse.data);

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
   * Real authorization is a full browser navigation to Google's OAuth consent screen and back —
   * there is no provider for this preview deploy to round-trip through (same reasoning as
   * `AuthService.startGoogleLogin`). The mock connects every available demo location directly
   * against `mock-backend/state.ts` and reloads the *same* page rather than navigating elsewhere:
   * that's exactly what the real flow amounts to from this page's own point of view, since the
   * genuine version also never runs any of its own return-handling JS — the return is a fresh load
   * of wherever the backend's callback redirects to, and that's this same connect screen.
   */
  static async startAuthorize(_returnTo: "onboarding" | "settings" = "onboarding"): Promise<void> {
    const { mockConnectAllAvailableLocations } =
      await import("@/app/_libs/mock-backend/connect-shortcut");
    mockConnectAllAvailableLocations();
    window.location.reload();
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

  /**
   * Every location the tenant has ever confirmed, active or not — used by onboarding's resume
   * logic to find which of several confirmed locations still need their backfill polled, since
   * `GET /v1/connections` only ever reports the tenant's single currently-selected one.
   */
  static async listLocations(signal?: AbortSignal): Promise<ConnectedLocation[]> {
    const apiResponse = await connectionsApi.connectionsControllerListLocationsV1({}, { signal });
    const response = unwrap<{ locations: PersistedLocationResponse[] }>(apiResponse.data);

    return response.locations.map(({ name, ...rest }) => ({ ...rest, businessName: name }));
  }

  /**
   * The tenant-wide "currently viewed" business (`tenants.active_location_id` on the backend) —
   * a single shared value, not per-user: every member's Dashboard/Review Queue reads whatever this
   * sets. Owner-only server-side (a member's attempt 403s); this method itself doesn't pre-check
   * the caller's role, matching how the rest of this service leaves authorization to the backend.
   */
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
