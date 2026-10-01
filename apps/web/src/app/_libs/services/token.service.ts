/**
 * The signed-in user's display name — the one piece of profile data still cached client-side, for
 * the shell's optimistic pre-paint (`storedDisplayName()` in `tenant-owner-profile.service.ts`).
 * Not a credential, so `localStorage` is fine for it. Everything that used to live alongside it
 * here (`hasPassword`, `businessName`, and the access token itself) either had no reader outside
 * this file or is answered by the `session` cookie instead — see `SESSION_HINT_*` below.
 */
const NAME_KEY = "access-token-name";

/**
 * `localStorage` keys this module used to write, before this refactor, and no longer does —
 * `ACCESS_TOKEN_KEY` held the actual JWT. Nothing in this file ever writes them again, but nothing
 * ever removed them from a browser that already had them either: a visitor signed in before this
 * shipped keeps carrying that JWT around in JS-readable storage indefinitely, which is exactly the
 * exposure this refactor exists to close. Swept on module load (see `pruneLegacyStorage` below)
 * rather than only on logout, since a long-lived session might otherwise never call `clear()` again
 * before the next server round-trip that could have caught it.
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
 * Mirrors the backend's `SESSION_HINT_COOKIE_NAME`/`SESSION_HINT_TENANT_VALUE`/
 * `SESSION_HINT_ADMIN_VALUE` (`apps/backend/src/api/auth/constants/auth.constants.ts`) — same
 * convention `proxy.ts` already follows for its own edge-side copy of these constants, since the
 * two apps don't share source.
 *
 * This cookie carries no credential — its value is just which kind of principal is signed in — and
 * is deliberately not `httpOnly` (`buildSessionHintCookieOptions` on the backend) specifically so
 * this file can read it directly instead of keeping a second, JS-readable copy of the actual access
 * token in `localStorage` the way this module used to. Reading it is never an authorization
 * decision, only a routing one: the backend enforces the real check on every request regardless of
 * what this cookie says.
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
 * Reads the non-credential `session` cookie the backend already sets on every sign-in — the same
 * signal `proxy.ts` uses at the edge, now also readable here. No network call and no JWT decoding:
 * the cookie already lives exactly as long as the session it describes (the refresh token's
 * lifetime for a tenant, the access token's own for a platform admin — see the backend's
 * `setSessionCookies`/`setAdminSessionCookies`), so there is nothing left to reconstruct from a
 * token payload.
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

  /**
   * Only the locally-cached display name — the `session` cookie itself is cleared by the backend
   * as part of `POST /v1/auth/logout` (see `AuthService.logout`), not by client-side JS.
   */
  static clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(NAME_KEY);
    pruneLegacyStorage();
  }
}
