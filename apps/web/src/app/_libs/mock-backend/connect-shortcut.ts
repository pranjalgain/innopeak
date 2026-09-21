import { decodeMockToken } from "./auth-context";
import { getDb, nextMockId } from "./state";

/**
 * The mock stand-in for `ConnectionService.startAuthorize`'s real OAuth round trip (see that
 * method's own comment) — connects every seeded available location for whichever tenant is
 * currently signed in, directly against `state.ts`, so reloading the connect screen right after
 * finds a fresh connection already in place exactly as a real return-from-Google would.
 */
export function mockConnectAllAvailableLocations(): void {
  const rawToken = window.localStorage.getItem("access-token");
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
    const alreadyConnected = db.locations.some(
      (location) =>
        location.tenantId === tenantId &&
        location.externalLocationId === available.externalLocationId,
    );
    if (alreadyConnected) continue;

    const now = new Date().toISOString();
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
      status: "ok",
      trigger: "backfill",
      startedAt: now,
      completedAt: now,
      reviewsFetched: 12,
      totalToImport: 12,
    });
  }
}
