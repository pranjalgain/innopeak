import { requireOwner, requireTenantUser } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockBackfill, type MockDb, type MockLocation, nextMockId } from "../state";

function existingBackfillFor(db: MockDb, locationId: string): MockBackfill | undefined {
  return db.backfills.find((b) => b.locationId === locationId);
}

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
      const auth = requireOwner(ctx.auth);
      // Scoped to this tenant, same as every other query here — an unscoped check would flag a
      // location as already connected because some *other* tenant happens to own it, which is
      // exactly the false "already connected" a brand-new tenant would otherwise hit here.
      const connected = new Set(
        getDb()
          .locations.filter((l) => l.tenantId === auth.tenantId)
          .map((l) => l.externalLocationId),
      );
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
        if (location) {
          // Same reactivation `connect-shortcut.ts` does for the mock "Connect Google" button —
          // this route is the picker's own confirm step, reached whenever `resume()` finds a
          // connection but no active location, which is exactly the state a disconnect leaves
          // behind. Without this, confirming the same location again after a disconnect would
          // leave it `inactive` and the tenant would read as still not connected.
          if (location.status === "inactive") {
            location.status = "active";
            location.lastSyncedAt = new Date().toISOString();
            location.lastSyncStatus = "ok";
          }
          location.connectionId = connection.id;
        }
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

      // One row per location, reused across repeat confirmations rather than appended to on
      // every call — a second `POST` for a location that's already backfilling (a double-click,
      // or re-confirming after a reload) must find the SAME run the poll route is already
      // tracking, not a second one it can never find because the first, stale row is still ahead
      // of it in the array.
      const backfillByLocation = new Map(confirmed.map((location) => [location.id, existingBackfillFor(db, location.id)]));
      for (const location of confirmed) {
        if (backfillByLocation.get(location.id)) continue;
        const created = {
          locationId: location.id,
          syncRunId: nextMockId("sync_run"),
          status: "running" as const,
          trigger: "backfill" as const,
          startedAt: new Date().toISOString(),
          completedAt: null,
          reviewsFetched: 0,
          totalToImport: 12,
          pollsSoFar: 0,
        };
        db.backfills.push(created);
        backfillByLocation.set(location.id, created);
      }

      return success(
        {
          locations: confirmed.map((location) => {
            const backfill = backfillByLocation.get(location.id);
            const backfillAlreadyRunning = backfill?.status === "running" && backfill.pollsSoFar > 0;
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
              backfill: backfill
                ? { syncRunId: backfill.syncRunId, status: backfill.status, startedAt: backfill.startedAt }
                : null,
              backfillAlreadyRunning,
            };
          }),
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

      const backfill = existingBackfillFor(getDb(), location.id);
      // The demo backfill completes on the *second* poll rather than staying "running" forever
      // (or finishing on the very first poll, which never gave the onboarding wizard's progress
      // screen anything in-progress to render at all) — `pollsSoFar` is what lets this tell "the
      // first read" from "a later one" apart, since nothing about the request itself does.
      if (backfill && backfill.status === "running") {
        if (backfill.pollsSoFar > 0) {
          backfill.status = "ok";
          backfill.completedAt = new Date().toISOString();
          backfill.reviewsFetched = backfill.totalToImport;
          location.onboardingBackfillCompletedAt = backfill.completedAt;
          location.lastSyncedAt = backfill.completedAt;
          location.lastSyncStatus = "ok";
        } else {
          backfill.pollsSoFar += 1;
          backfill.reviewsFetched = Math.round((backfill.totalToImport ?? 0) / 2);
        }
      }

      return success({
        locationId: location.id,
        syncRunId: backfill?.syncRunId ?? null,
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
