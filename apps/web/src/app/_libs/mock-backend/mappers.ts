import { mintAccessToken, MOCK_ACCESS_TOKEN_TTL_SECONDS } from "./jwt";
import { setMockSession } from "./session-cookie";
import { getDb, type MockAdmin, type MockUser } from "./state";

export function findTenant(tenantId: string) {
  const tenant = getDb().tenants.find((t) => t.id === tenantId);
  if (!tenant) throw new Error(`mock-backend: unknown tenantId ${tenantId}`);
  return tenant;
}

export function hasConnectedBusiness(tenantId: string): boolean {
  const tenant = findTenant(tenantId);
  if (!tenant.activeLocationId) return false;
  return getDb().locations.some(
    (location) => location.id === tenant.activeLocationId && location.status === "active",
  );
}

export function toAuthenticatedUserDto(user: MockUser) {
  const tenant = findTenant(user.tenantId);
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    businessName: tenant.name,
    role: user.role,
    hasPassword: user.passwordHash !== null,
    avatarUrl: user.avatarUrl,
    locale: user.locale,
  };
}

/** Mints a token, sets both mock cookies, and returns the `TokenResponseDto` shape login/signup
 *  verification/Google completion/member-invite-accept/change-password/set-password/locale-update
 *  all answer with. */
export function issueTenantSession(user: MockUser): {
  accessToken: string;
  expiresIn: number;
  user: ReturnType<typeof toAuthenticatedUserDto>;
  hasConnectedBusiness: boolean;
} {
  setMockSession("tenant", user.id);
  return {
    accessToken: mintTenantAccessToken(user),
    expiresIn: MOCK_ACCESS_TOKEN_TTL_SECONDS,
    user: toAuthenticatedUserDto(user),
    hasConnectedBusiness: hasConnectedBusiness(user.tenantId),
  };
}

// The extra claims (`userId`/`tenantId`/`role`) only this mock backend's own token decoding reads
// — see `auth-context.ts`. Every tenant token is minted through here, `issueTenantSession`
// included, so the claims never drift out of sync with the plain email/type ones `jwt.ts` mints.
export function mintTenantAccessToken(user: MockUser): string {
  const base = mintAccessToken({
    email: user.email,
    type: "tenant_user",
    ttlSeconds: MOCK_ACCESS_TOKEN_TTL_SECONDS,
  });
  return appendMockClaims(base, { userId: user.id, tenantId: user.tenantId, role: user.role });
}

export function mintAdminAccessToken(admin: MockAdmin): string {
  const base = mintAccessToken({
    email: admin.email,
    type: "platform_admin",
    ttlSeconds: MOCK_ACCESS_TOKEN_TTL_SECONDS,
  });
  return appendMockClaims(base, { adminId: admin.id });
}

/** Splices extra claims into an already-minted token's payload segment — kept separate from
 *  `jwt.ts` so that file stays a pure, generic "mint a JWT-shaped string" helper with no knowledge
 *  of this app's own domain claims. */
function appendMockClaims(token: string, extra: Record<string, string>): string {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return token;
  const decoded = JSON.parse(
    typeof window === "undefined"
      ? Buffer.from(payload, "base64").toString("utf-8")
      : decodeURIComponent(escape(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/")))),
  ) as Record<string, unknown>;
  const merged = { ...decoded, ...extra };
  const reEncoded =
    typeof window === "undefined"
      ? Buffer.from(JSON.stringify(merged), "utf-8").toString("base64")
      : window.btoa(unescape(encodeURIComponent(JSON.stringify(merged))));
  const base64url = reEncoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${header}.${base64url}.${signature}`;
}

export function toAdminProfileDto(admin: MockAdmin) {
  return {
    email: admin.email,
    avatarUrl: admin.avatarUrl,
    locale: admin.locale,
    hasPassword: admin.passwordHash !== null,
  };
}

export function issueAdminSession(admin: MockAdmin): {
  accessToken: string;
  expiresIn: number;
  admin: { id: string; email: string; locale: string | null };
} {
  setMockSession("admin", admin.id);
  return {
    accessToken: mintAdminAccessToken(admin),
    expiresIn: MOCK_ACCESS_TOKEN_TTL_SECONDS,
    admin: { id: admin.id, email: admin.email, locale: admin.locale },
  };
}

export function toAdminInviteResponseDto(admin: MockAdmin) {
  return {
    id: admin.id,
    email: admin.email,
    status: admin.status,
    invitedAt: admin.invitedAt,
    expiresAt: admin.expiresAt,
    isRoot: admin.isRoot,
  };
}
