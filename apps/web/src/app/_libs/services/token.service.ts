const ACCESS_TOKEN_KEY = "access-token";
/**
 * The signed-in user's display name — set alongside the access token whenever a response carries
 * one (login, signup, refresh, Google completion), never decoded from the JWT: the access token
 * carries no `name` claim, only `email`/`exp`, so this is the one piece of profile data that has
 * to be stored explicitly rather than read back out of the token itself.
 */
const NAME_KEY = "access-token-name";

/**
 * Whether the signed-in user has a password set — same rationale as `NAME_KEY`: the access token
 * carries no such claim, so it's stored explicitly from whatever auth response last carried it
 * (login, signup, refresh, change/set-password, Google completion) rather than decoded.
 */
const HAS_PASSWORD_KEY = "access-token-has-password";

/** The tenant/company name set at signup (`tenants.name`) — same rationale as `NAME_KEY`. Read-only in Settings. */
const BUSINESS_NAME_KEY = "access-token-business-name";

/** Treat a token as expired slightly early, so one that would die mid-flight is refreshed first. */
const EXPIRY_SKEW_SECONDS = 30;

/** Mirrors the backend's `JwtTokenType` enum (`apps/backend/src/api/auth/enums/jwt-token-type.enum.ts`) — the two values an access token can carry. `"refresh"` is a distinct third `type` on that enum but never appears on an *access* token, so it's not part of this union. */
export type TokenType = "tenant_user" | "platform_admin";

interface AccessTokenClaims {
  exp?: number;
  email?: string;
  type?: TokenType;
}

/**
 * Holds the access token in localStorage. The refresh token is NOT stored here (and couldn't be
 * read even if we tried): it travels only as an httpOnly `refresh_token` cookie the backend sets
 * directly, invisible to this or any other client-side JS.
 *
 * Everything here checks *expiry*, never mere presence. A stored-but-expired token is worse than
 * no token at all: the route guards would read it as "signed in" while the backend and the edge
 * middleware both read the same session as signed out, and the two disagreeing is what produced
 * an infinite /login <-> /dashboard redirect loop for anyone idle past the 15-minute access TTL.
 */
export class TokenService {
  /** The raw stored string, expired or not — only for callers that are about to refresh it. */
  static getStoredAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  /** The token to actually authenticate with: null when absent OR expired. */
  static getAccessToken(): string | null {
    const token = this.getStoredAccessToken();
    if (!token || this.isExpired(token)) return null;
    return token;
  }

  static setAccessToken(accessToken: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  }

  static clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(NAME_KEY);
    window.localStorage.removeItem(HAS_PASSWORD_KEY);
    window.localStorage.removeItem(BUSINESS_NAME_KEY);
  }

  /** Email claim from the stored access token — display only, never used as authorization. */
  static getEmail(): string | null {
    const token = this.getStoredAccessToken();
    if (!token) return null;
    const email = this.decode(token)?.email;
    return typeof email === "string" && email.length > 0 ? email : null;
  }

  /**
   * Unlike every other claim reader here, this one IS used for authorization — of a routing
   * decision, not an API call. Route guards (`RequireAuth`, `AdminGuard`, `RedirectIfAuthenticated`)
   * need to tell a tenant-user token from a platform-admin one to know which pages a valid,
   * unexpired token is actually good for; without it, any guard that only checked "is there a
   * token" treated the two as interchangeable, and a platform admin manually navigating to a
   * tenant-only route (or the reverse) had no way to be routed anywhere but back into the very
   * page that had just rejected them. This is still not a security boundary — the payload is
   * read, not verified, and the backend independently enforces the real check on every request —
   * it only ever decides which client-side page to show, never whether a request succeeds.
   *
   * Uses the raw stored token (expired or not), same as `getEmail` — a token past its TTL still
   * carries a real `type` claim, and a guard mid-refresh needs to know which principal it's
   * refreshing before deciding whether the attempt even makes sense.
   */
  static getTokenType(): TokenType | null {
    const token = this.getStoredAccessToken();
    if (!token) return null;
    const type = this.decode(token)?.type;
    return type === "tenant_user" || type === "platform_admin" ? type : null;
  }

  /** Display only, same as `getEmail` — never used as authorization. */
  static getName(): string | null {
    if (typeof window === "undefined") return null;
    const name = window.localStorage.getItem(NAME_KEY);
    return name && name.length > 0 ? name : null;
  }

  static setName(name: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NAME_KEY, name);
  }

  /** Null means "unknown" (nothing stored yet) — callers fall back rather than assume either way. */
  static getHasPassword(): boolean | null {
    if (typeof window === "undefined") return null;
    const value = window.localStorage.getItem(HAS_PASSWORD_KEY);
    return value === null ? null : value === "true";
  }

  static setHasPassword(hasPassword: boolean): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(HAS_PASSWORD_KEY, String(hasPassword));
  }

  static getBusinessName(): string | null {
    if (typeof window === "undefined") return null;
    const name = window.localStorage.getItem(BUSINESS_NAME_KEY);
    return name && name.length > 0 ? name : null;
  }

  static setBusinessName(businessName: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BUSINESS_NAME_KEY, businessName);
  }

  /**
   * Reads `exp` out of the JWT payload. This is a client-side *scheduling* hint only — it decides
   * when to refresh, never whether to trust the token; the signature is verified by the backend on
   * every request. A malformed or unparseable token counts as expired so the caller refreshes or
   * signs out rather than sending garbage.
   */
  static isExpired(token: string): boolean {
    const claims = this.decode(token);
    if (typeof claims?.exp !== "number") return true;
    return claims.exp * 1000 <= Date.now() + EXPIRY_SKEW_SECONDS * 1000;
  }

  private static decode(token: string): AccessTokenClaims | null {
    const payload = token.split(".")[1];
    if (!payload) return null;

    try {
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(base64)) as AccessTokenClaims;
    } catch {
      return null;
    }
  }
}
