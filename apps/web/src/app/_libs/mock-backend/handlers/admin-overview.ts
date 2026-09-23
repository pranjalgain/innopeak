import { connectionStatusFor, toAdminBusinessDto } from "./admin-businesses";
import { requireAdmin } from "../auth-context";
import { success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockTenant } from "../state";

const CONNECTION_PRIORITY: Record<ReturnType<typeof connectionStatusFor>, number | null> = {
  disconnected: 0,
  needs_reauth: 1,
  never_connected: 2,
  connected: null,
};

function parsePositiveInt(query: URLSearchParams, key: string, fallback: number): number {
  const raw = query.get(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function monthKeyOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export const adminOverviewRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/admin/overview/stats",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const db = getDb();
      const totalRepliesSent = db.reviews.reduce(
        (count, review) =>
          count + review.responses.filter((response) => response.status === "approved").length,
        0,
      );
      return success({
        businessCount: db.tenants.length,
        userCount: db.users.length,
        totalReviewsFetched: db.reviews.length,
        totalRepliesSent,
      });
    },
  },
  {
    method: "GET",
    pattern: "/v1/admin/overview/recent-businesses",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const limit = parsePositiveInt(ctx.query, "limit", 5);
      const tenants = [...getDb().tenants]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
      return success(tenants.map(toAdminBusinessDto));
    },
  },
  {
    method: "GET",
    pattern: "/v1/admin/overview/needs-attention",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const limit = parsePositiveInt(ctx.query, "limit", 3);
      // Mirrors `AdminBusinessesRepository.findNeedingAttention`: excludes connected tenants,
      // ranks disconnected ahead of needs-reauth ahead of never-connected, ties broken newest first.
      const needing = getDb()
        .tenants.map((tenant) => ({ tenant, priority: CONNECTION_PRIORITY[connectionStatusFor(tenant)] }))
        .filter((entry): entry is { tenant: MockTenant; priority: number } => entry.priority !== null)
        .sort((a, b) => a.priority - b.priority || b.tenant.createdAt.localeCompare(a.tenant.createdAt))
        .slice(0, limit);
      return success(needing.map((entry) => toAdminBusinessDto(entry.tenant)));
    },
  },
  {
    method: "GET",
    pattern: "/v1/admin/overview/signup-trend",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const months = parsePositiveInt(ctx.query, "months", 6);
      const now = new Date();
      const points = Array.from({ length: months }, (_, indexFromOldest) => {
        const offset = months - 1 - indexFromOldest;
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
        const monthKey = `${String(date.getUTCFullYear())}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
        const count = getDb().tenants.filter((tenant) => monthKeyOf(tenant.createdAt) === monthKey).length;
        return { monthKey, count };
      });
      return success(points);
    },
  },
  {
    method: "GET",
    pattern: "/v1/admin/overview/activity",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const entries = [...getDb().activity].sort((a, b) =>
        b.occurredAt.localeCompare(a.occurredAt),
      );
      return success(entries);
    },
  },
]);
