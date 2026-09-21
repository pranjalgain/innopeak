import { requireOwner, requireTenantUser } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockLocation, nextMockId } from "../state";

interface ConfirmLocationBody {
  externalLocationIds?: string[];
}
interface SetActiveLocationBody {
  locationId?: string;
}

function toConnectionLocationDto(location: MockLocation) {
  return {
    id: location.id,
    provider: "google" as const,
    externalLocationId: location.externalLocationId,
    businessName: location.name,
    address: location.address,
    status: location.status,
    lastSyncedAt: location.lastSyncedAt,
    lastSyncStatus: location.lastSyncStatus,
    lastSyncError: location.lastSyncError,
    onboardingBackfillCompletedAt: location.onboardingBackfillCompletedAt,
  };
}

function toLocationDto(location: MockLocation) {
  return {
    id: location.id,
    connectionId: location.connectionId,
    provider: "google" as const,
    externalLocationId: location.externalLocationId,
    name: location.name,
    address: location.address,
    status: location.status,
    lastSyncedAt: location.lastSyncedAt,
    lastSyncStatus: location.lastSyncStatus,
    lastSyncError: location.lastSyncError,
    onboardingBackfillCompletedAt: location.onboardingBackfillCompletedAt,
    createdAt: location.createdAt,
  };
}

export const connectionsRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/connections",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const db = getDb();
      const tenant = db.tenants.find((t) => t.id === auth.tenantId);
      const connection = db.connections.find((c) => c.tenantId === auth.tenantId);
      const activeLocation = tenant?.activeLocationId
        ? db.locations.find((l) => l.id === tenant.activeLocationId)
        : undefined;
      const connected = Boolean(connection && activeLocation?.status === "active");

      return success({
        connected,
        status: connected ? "connected" : "disconnected",
        connection: connection
          ? {
              id: connection.id,
              provider: "google" as const,
              providerAccountId: connection.providerAccountId,
              connectionStatus: connection.connectionStatus,
              tokenExpiresAt: null,
              connectedByUserId: auth.userId,
              connectedAt: connection.connectedAt,
            }
          : null,
        location: activeLocation ? toConnectionLocationDto(activeLocation) : null,
      });
    },
  },
  {
    method: "GET",
    pattern: "/v1/connections/google/available-locations",
    handler: (ctx) => {
      requireOwner(ctx.auth);
      const connected = new Set(getDb().locations.map((l) => l.externalLocationId));
      const locations = getDb().availableLocations.map((location) => ({
        ...location,
        alreadyConnected: connected.has(location.externalLocationId),
      }));
      return success({ locations });
    },
  },
  {
    method: "POST",
    pattern: "/v1/connections/locations",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const body = ctx.body as ConfirmLocationBody;
      const externalIds = body.externalLocationIds ?? [];
      if (externalIds.length === 0) return failure(400, "At least one location is required.");

      const db = getDb();
      let connection = db.connections.find((c) => c.tenantId === auth.tenantId);
      connection ??= {
        id: nextMockId("connection"),
        tenantId: auth.tenantId,
        providerAccountId: `google-account-${auth.tenantId}`,
        connectionStatus: "active",
        connectedAt: new Date().toISOString(),
      };
      if (!db.connections.includes(connection)) db.connections.push(connection);

      const confirmed = externalIds.map((externalLocationId) => {
        const available = db.availableLocations.find(
          (l) => l.externalLocationId === externalLocationId,
        );
        let location = db.locations.find(
          (l) => l.tenantId === auth.tenantId && l.externalLocationId === externalLocationId,
        );
        if (!location) {
          location = {
            id: nextMockId("location"),
            tenantId: auth.tenantId,
            connectionId: connection.id,
            externalLocationId,
            name: available?.name ?? "Connected location",
            address: available?.address ?? null,
            status: "active",
            lastSyncedAt: null,
            lastSyncStatus: null,
            lastSyncError: null,
            onboardingBackfillCompletedAt: null,
            createdAt: new Date().toISOString(),
          };
          db.locations.push(location);
        }
        return location;
      });

      const tenant = db.tenants.find((t) => t.id === auth.tenantId);
      if (tenant && !tenant.activeLocationId) tenant.activeLocationId = confirmed[0]!.id;

      for (const location of confirmed) {
        db.backfills.push({
          locationId: location.id,
          status: "running",
          trigger: "backfill",
          startedAt: new Date().toISOString(),
          completedAt: null,
          reviewsFetched: 0,
          totalToImport: 12,
        });
      }

      return success(
        {
          locations: confirmed.map((location) => ({
            id: location.id,
            connectionId: location.connectionId,
            provider: "google" as const,
            externalLocationId: location.externalLocationId,
            name: location.name,
            address: location.address,
            status: location.status,
            lastSyncedAt: location.lastSyncedAt,
            lastSyncStatus: location.lastSyncStatus,
            lastSyncError: location.lastSyncError,
            onboardingBackfillCompletedAt: location.onboardingBackfillCompletedAt,
            createdAt: location.createdAt,
            backfill: {
              syncRunId: nextMockId("sync_run"),
              status: "running",
              startedAt: new Date().toISOString(),
            },
            backfillAlreadyRunning: false,
          })),
        },
        "Locations connected.",
        201,
      );
    },
  },
  {
    method: "GET",
    pattern: "/v1/connections/locations",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const locations = getDb()
        .locations.filter((location) => location.tenantId === auth.tenantId)
        .map(toLocationDto);
      return success({ locations });
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/connections/active-location",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const body = ctx.body as SetActiveLocationBody;
      const location = getDb().locations.find(
        (l) => l.id === body.locationId && l.tenantId === auth.tenantId,
      );
      if (!location) return failure(404, "No such location.");
      const tenant = getDb().tenants.find((t) => t.id === auth.tenantId);
      if (tenant) tenant.activeLocationId = location.id;
      return success(toLocationDto(location));
    },
  },
  {
    method: "GET",
    pattern: "/v1/connections/locations/:locationId/backfill",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const location = getDb().locations.find(
        (l) => l.id === ctx.params.locationId && l.tenantId === auth.tenantId,
      );
      if (!location) return failure(404, "No such location.");

      const backfill = getDb().backfills.find((b) => b.locationId === location.id);
      // The demo backfill completes instantly on the second poll rather than staying "running"
      // forever — this is the ONE piece of state that advances on its own between two calls,
      // since the onboarding wizard's own progress screen has nothing to show otherwise.
      if (backfill && backfill.status === "running") {
        backfill.status = "ok";
        backfill.completedAt = new Date().toISOString();
        backfill.reviewsFetched = backfill.totalToImport;
        location.onboardingBackfillCompletedAt = backfill.completedAt;
        location.lastSyncedAt = backfill.completedAt;
        location.lastSyncStatus = "ok";
      }

      return success({
        locationId: location.id,
        syncRunId: backfill ? nextMockId("sync_run_poll") : null,
        status: backfill?.status ?? "ok",
        reviewsFetched: backfill?.reviewsFetched ?? 0,
        totalToImport: backfill?.totalToImport ?? 0,
        progress:
          backfill?.totalToImport && backfill.totalToImport > 0
            ? Math.round(((backfill.reviewsFetched ?? 0) / backfill.totalToImport) * 100)
            : null,
        errorMessage: null,
        isStale: false,
        livePollingEnabled: location.onboardingBackfillCompletedAt !== null,
      });
    },
  },
  {
    method: "DELETE",
    pattern: "/v1/connections/google",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const db = getDb();
      const deactivated = db.locations.filter(
        (l) => l.tenantId === auth.tenantId && l.status === "active",
      );
      for (const location of deactivated) location.status = "inactive";
      db.connections = db.connections.filter((c) => c.tenantId !== auth.tenantId);
      const tenant = db.tenants.find((t) => t.id === auth.tenantId);
      if (tenant) tenant.activeLocationId = null;

      return success({
        provider: "google" as const,
        deactivatedLocationIds: deactivated.map((location) => location.id),
        credentialRevoked: true,
        pollingStopped: true,
      });
    },
  },
]);
