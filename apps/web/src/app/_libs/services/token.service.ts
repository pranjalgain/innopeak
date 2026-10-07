/** The one piece of profile data still cached client-side (not a credential, so `localStorage` is fine), for the shell's optimistic pre-paint. */
const NAME_KEY = "access-token-name";

/**
 * Legacy `localStorage` keys (`ACCESS_TOKEN_KEY` held the JWT). Browsers that signed in earlier still carry them in
 * JS-readable storage, so they are swept on module load rather than only on `clear()`, which a long-lived session may never call.
 */
const LEGACY_STORAGE_KEYS = [
  "access-token",
  "access-token-has-password",
  "access-token-business-name",
];

function pruneLegacyStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
}

pruneLegacyStorage();

/**
 * Mirrors the backend's `SESSION_HINT_*` constants (`apps/backend/src/api/auth/constants/auth.constants.ts`); `proxy.ts` keeps
 * its own copy since the apps share no source. The cookie carries no credential and is deliberately not `httpOnly`, so this file
 * can read it without a JS-readable copy of the access token. Routing only, never authorization: the backend checks every request.
 */
const SESSION_HINT_COOKIE_NAME = "session";
const SESSION_HINT_TENANT_VALUE = "tenant";
const SESSION_HINT_ADMIN_VALUE = "admin";
/** MIGRATION SHIM — see `proxy.ts`'s own copy of this constant for why it has to keep meaning "tenant". */
const SESSION_HINT_LEGACY_TENANT_VALUE = "1";

export type TokenType = "tenant_user" | "platform_admin";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Reads the `session` cookie: no network call or JWT decoding, since it lives exactly as long as the session it describes
 * (the refresh token's lifetime for a tenant, the access token's for an admin).
 */
export class TokenService {
  /** Which principal (if any) is currently signed in — `null` means signed out. */
  static getTokenType(): TokenType | null {
    const value = readCookie(SESSION_HINT_COOKIE_NAME);
    if (value === SESSION_HINT_ADMIN_VALUE) return "platform_admin";
    if (value === SESSION_HINT_TENANT_VALUE || value === SESSION_HINT_LEGACY_TENANT_VALUE) {
      return "tenant_user";
    }
    return null;
  }

  static hasSession(): boolean {
    return this.getTokenType() !== null;
  }

  /** Display only, never used as authorization. */
  static getName(): string | null {
    if (typeof window === "undefined") return null;
    const name = window.localStorage.getItem(NAME_KEY);
    return name && name.length > 0 ? name : null;
  }

  static setName(name: string): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NAME_KEY, name);
  }

  /** Only the cached display name: the backend clears the `session` cookie on `POST /v1/auth/logout`, not client JS. */
  static clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(NAME_KEY);
    pruneLegacyStorage();
  }
}
