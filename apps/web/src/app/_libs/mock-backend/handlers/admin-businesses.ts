import { requireAdmin } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockTenant } from "../state";

interface UpdateBusinessStatusBody {
  status?: "active" | "suspended";
}

function connectionStatusFor(
  tenant: MockTenant,
): "connected" | "needs_reauth" | "disconnected" | "never_connected" {
  if (!tenant.activeLocationId) return "never_connected";
  const connection = getDb().connections.find((c) => c.tenantId === tenant.id);
  if (!connection) return "disconnected";
  return connection.connectionStatus === "needs_reauth" ? "needs_reauth" : "connected";
}

function toAdminBusinessDto(tenant: MockTenant) {
  const owner = getDb().users.find((user) => user.tenantId === tenant.id && user.role === "owner");
  const userCount = getDb().users.filter((user) => user.tenantId === tenant.id).length;
  return {
    id: tenant.id,
    name: tenant.name,
    status: tenant.status,
    connectionStatus: connectionStatusFor(tenant),
    ownerName: owner?.name ?? "—",
    ownerEmail: owner?.email ?? "—",
    userCount,
    createdAt: tenant.createdAt,
  };
}

export const adminBusinessesRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/admin/businesses",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      return success(getDb().tenants.map(toAdminBusinessDto));
    },
  },
  {
    method: "POST",
    pattern: "/v1/admin/businesses/:tenantId/status",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const tenant = getDb().tenants.find((t) => t.id === ctx.params.tenantId);
      if (!tenant) return failure(404, "No business with that id.");
      const body = ctx.body as UpdateBusinessStatusBody;
      if (body.status) tenant.status = body.status;
      return success(toAdminBusinessDto(tenant));
    },
  },
]);
