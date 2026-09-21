import { issueAdminSession } from "../mappers";
import { success } from "../response";
import { defineRoutes } from "../router";
import { getDb, type MockAdmin } from "../state";

interface AdminLoginBody {
  email?: string;
}

/** Same "anything signs in" rule as the tenant side (`handlers/auth.ts`) — typing the second
 *  admin's seeded address (`constants.ts`) signs in as them, anything else signs in as root. */
function resolveAdminLoginUser(email: string | undefined): MockAdmin {
  const normalized = email?.trim().toLowerCase();
  const match = normalized
    ? getDb().admins.find((admin) => admin.email.toLowerCase() === normalized)
    : undefined;
  return match ?? getDb().admins[0]!;
}

export const adminAuthRoutes = defineRoutes([
  {
    method: "POST",
    pattern: "/v1/admin/auth/login",
    handler: (ctx) => {
      const body = ctx.body as AdminLoginBody;
      return success(issueAdminSession(resolveAdminLoginUser(body.email)));
    },
  },
  {
    method: "GET",
    pattern: "/v1/admin/auth/invite/:token",
    handler: () => success({ email: "invited-admin@example.com" }),
  },
  {
    method: "POST",
    pattern: "/v1/admin/auth/invite/accept",
    handler: () => success(issueAdminSession(getDb().admins[1]!)),
  },
]);
