import { TokenService } from "@/app/_libs/services/token.service";

import { decodeMockToken } from "./auth-context";
import { getDb, nextMockId } from "./state";

/**
 * The mock stand-in for `ConnectionService.startAuthorize`'s real OAuth round trip (see that
 * method's own comment) — connects every seeded available location for whichever tenant is
 * currently signed in, directly against `state.ts`, so reloading the connect screen right after
 * finds a fresh connection already in place exactly as a real return-from-Google would.
 */
export function mockConnectAllAvailableLocations(): void {
  const rawToken = TokenService.getStoredAccessToken();
  const claims = rawToken ? decodeMockToken(rawToken) : null;
  const tenantId = claims?.tenantId;
  if (!tenantId) return;

  const db = getDb();
  const tenant = db.tenants.find((t) => t.id === tenantId);
  if (!tenant) return;

  let connection = db.connections.find((c) => c.tenantId === tenantId);
  connection ??= {
    id: nextMockId("connection"),
    tenantId,
    providerAccountId: `google-account-${tenantId}`,
    connectionStatus: "active",
    connectedAt: new Date().toISOString(),
  };
  if (!db.connections.includes(connection)) db.connections.push(connection);

  for (const available of db.availableLocations) {
    const now = new Date().toISOString();
    const existing = db.locations.find(
      (location) =>
        location.tenantId === tenantId && location.externalLocationId === available.externalLocationId,
    );

    // A location that's already connected but was previously disconnected (see `DELETE
    // /v1/connections/google`, which marks every location `inactive` rather than deleting it)
    // needs reactivating, not skipping — otherwise "reconnect" after a disconnect silently does
    // nothing and the tenant is left permanently unconnected.
    if (existing) {
      if (existing.status === "inactive") {
        existing.status = "active";
        existing.lastSyncedAt = now;
        existing.lastSyncStatus = "ok";
      }
      tenant.activeLocationId ??= existing.id;
      continue;
    }

    const location = {
      id: nextMockId("location"),
      tenantId,
      connectionId: connection.id,
      externalLocationId: available.externalLocationId,
      name: available.name,
      address: available.address,
      status: "active" as const,
      lastSyncedAt: now,
      lastSyncStatus: "ok" as const,
      lastSyncError: null,
      onboardingBackfillCompletedAt: now,
      createdAt: now,
    };
    db.locations.push(location);
    tenant.activeLocationId ??= location.id;
    db.backfills.push({
      locationId: location.id,
      syncRunId: nextMockId("sync_run"),
      status: "ok",
      trigger: "backfill",
      startedAt: now,
      completedAt: now,
      reviewsFetched: 12,
      totalToImport: 12,
      pollsSoFar: 1,
    });
  }
}
