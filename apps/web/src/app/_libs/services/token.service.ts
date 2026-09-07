const ACCESS_TOKEN_KEY = "access-token";

/** Treat a token as expired slightly early, so one that would die mid-flight is refreshed first. */
const EXPIRY_SKEW_SECONDS = 30;

interface AccessTokenClaims {
  exp?: number;
  email?: string;
}

/**
 * Holds the access token in localStorage — same storage mechanism the existing mock
 * `SessionService` already uses for the role flag. The refresh token is NOT stored here (and
 * couldn't be read even if we tried): it travels only as an httpOnly `refresh_token` cookie the
 * backend sets directly, invisible to this or any other client-side JS.
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
  }

  /** Email claim from the stored access token — display only, never used as authorization. */
  static getEmail(): string | null {
    const token = this.getStoredAccessToken();
    if (!token) return null;
    const email = this.decode(token)?.email;
    return typeof email === "string" && email.length > 0 ? email : null;
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
