import { requireAdmin } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb } from "../state";

function toAdminUserDto(user: ReturnType<typeof getDb>["users"][number]) {
  const tenant = getDb().tenants.find((t) => t.id === user.tenantId);
  return {
    id: user.id,
    businessId: user.tenantId,
    businessName: tenant?.name ?? "Unknown business",
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.status === "active",
    lastLoginAt: user.lastLoginAt,
  };
}

export const adminUsersRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/admin/users",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      return success(getDb().users.map(toAdminUserDto));
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/admin/users/:userId/toggle-active",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const user = getDb().users.find((u) => u.id === ctx.params.userId);
      if (!user) return failure(404, "No user with that id.");
      user.status = user.status === "active" ? "disabled" : "active";
      return success(toAdminUserDto(user));
    },
  },
]);
