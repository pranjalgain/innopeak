import { requireTenantUser } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb } from "../state";

function unreadTotal(tenantId: string, userId: string): number {
  return getDb().notifications.filter(
    (n) => n.tenantId === tenantId && n.userId === userId && n.readAt === null,
  ).length;
}

export const notificationsRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/notifications",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const offset = Number(ctx.query.get("offset") ?? "0") || 0;
      const limit = Number(ctx.query.get("limit") ?? "20") || 20;

      const own = getDb()
        .notifications.filter((n) => n.tenantId === auth.tenantId && n.userId === auth.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));

      const page = own.slice(offset, offset + limit);
      const items = page.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        description: n.description,
        reviewId: n.reviewId,
        isRead: n.readAt !== null,
        createdAt: n.createdAt,
      }));

      return success({
        items,
        hasMore: offset + limit < own.length,
        unreadTotal: unreadTotal(auth.tenantId, auth.userId),
      });
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/notifications/read-all",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const now = new Date().toISOString();
      for (const n of getDb().notifications) {
        if (n.tenantId === auth.tenantId && n.userId === auth.userId && n.readAt === null) {
          n.readAt = now;
        }
      }
      return success({ unreadTotal: unreadTotal(auth.tenantId, auth.userId) });
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/notifications/:notificationId/read",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const notification = getDb().notifications.find(
        (n) =>
          n.id === ctx.params.notificationId &&
          n.tenantId === auth.tenantId &&
          n.userId === auth.userId,
      );
      if (!notification) return failure(404, "Notification not found.");
      notification.readAt ??= new Date().toISOString();
      return success({ unreadTotal: unreadTotal(auth.tenantId, auth.userId) });
    },
  },
]);
