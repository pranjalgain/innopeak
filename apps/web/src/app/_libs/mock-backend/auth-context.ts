import { failure } from "./response";

/**
 * Everything a mock access token carries. `email`/`type` are the two fields the real frontend's
 * own `TokenService.decode` also reads (see `jwt.ts`) — `userId`/`tenantId`/`role`/`adminId` are
 * extra claims only this mock backend reads, standing in for what a real JWT's server-verified
 * payload (and a database lookup) would give a real backend. There is exactly one seeded tenant
 * and one seeded admin roster, so these are enough to answer every handler's "who is calling, and
 * what may they see" without a session store.
 */
export interface MockAuthContext {
  email: string;
  type: "tenant_user" | "platform_admin";
  userId?: string;
  tenantId?: string;
  role?: "owner" | "member";
  adminId?: string;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return typeof window === "undefined"
    ? Buffer.from(padded, "base64").toString("utf-8")
    : decodeURIComponent(escape(window.atob(padded)));
}

/** Decodes a raw mock access token — returns null for anything malformed rather than throwing,
 *  since an unauthenticated/garbled token is a normal, expected case every caller decides how to
 *  answer (a public route ignores it; a protected one calls `requireTenantUser`/`requireAdmin`
 *  below; `connect-shortcut.ts` uses it to find the current demo tenant outside a request at all). */
export function decodeMockToken(token: string): MockAuthContext | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const claims = JSON.parse(base64UrlDecode(payload)) as Partial<MockAuthContext>;
    if (typeof claims.email !== "string") return null;
    if (claims.type !== "tenant_user" && claims.type !== "platform_admin") return null;
    return claims as MockAuthContext;
  } catch {
    return null;
  }
}

/** Decodes the Bearer token the real request interceptor already attached. */
export function decodeAuthHeader(authorizationHeader: string | undefined): MockAuthContext | null {
  if (!authorizationHeader?.startsWith("Bearer ")) return null;
  return decodeMockToken(authorizationHeader.slice("Bearer ".length));
}

export interface TenantAuthContext {
  userId: string;
  tenantId: string;
  role: "owner" | "member";
  email: string;
}

/** Every tenant-scoped handler starts here — mirrors the real backend's `requireTenantUser`,
 *  including the 401 for "not signed in at all" vs. the shape the caller then trusts completely. */
export function requireTenantUser(auth: MockAuthContext | null): TenantAuthContext {
  if (!auth || auth.type !== "tenant_user" || !auth.userId || !auth.tenantId || !auth.role) {
    return failure(401, "Missing or invalid access token.");
  }
  return { userId: auth.userId, tenantId: auth.tenantId, role: auth.role, email: auth.email };
}

/** Owner-only routes (Settings, invites, general config) — a member reaches here and gets the same
 *  403 shape the real `RolesGuard` would answer with. */
export function requireOwner(auth: MockAuthContext | null): TenantAuthContext {
  const user = requireTenantUser(auth);
  if (user.role !== "owner") {
    return failure(403, "Only the account owner can do this.");
  }
  return user;
}

export interface AdminAuthContext {
  adminId: string;
  email: string;
}

export function requireAdmin(auth: MockAuthContext | null): AdminAuthContext {
  if (!auth || auth.type !== "platform_admin" || !auth.adminId) {
    return failure(401, "Missing or invalid access token.");
  }
  return { adminId: auth.adminId, email: auth.email };
}
