/**
 * Two cookies this mock writes on a successful sign-in, neither of them a real credential:
 *
 * - `session` — the real app's own routing hint (`apps/web/src/proxy.ts`), `tenant` or `admin`.
 *   The edge middleware reads only this one; nothing here changes what it does with it.
 * - `mock_identity` — this mock's own marker, naming *which* seeded identity is signed in
 *   (`owner` | `member` | a real signed-up user's id | `root` | `second_admin`). Real sessions
 *   answer this question from the httpOnly refresh-token cookie; since nothing here is real,
 *   `handlers/auth.ts`'s `/v1/auth/refresh` reads this plain one instead, to mint a fresh access
 *   token for the right identity without a request body to read.
 *
 * Both are plain, non-httpOnly cookies set directly from browser JS — there is no real network
 * response for the browser to apply a `Set-Cookie` header from, since `adapter.ts` never makes a
 * real request at all.
 */

const SESSION_HINT_COOKIE = "session";
const IDENTITY_COOKIE = "mock_identity";

function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  // Session-length (no `expires`) and `path=/` — same scope the real cookies use, per `proxy.ts`.
  document.cookie = `${name}=${value}; path=/; SameSite=Lax`;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ?? null;
}

export function setMockSession(kind: "tenant" | "admin", identity: string): void {
  setCookie(SESSION_HINT_COOKIE, kind);
  setCookie(IDENTITY_COOKIE, identity);
}

export function clearMockSession(): void {
  clearCookie(SESSION_HINT_COOKIE);
  clearCookie(IDENTITY_COOKIE);
}

export function getMockIdentity(): string | null {
  return readCookie(IDENTITY_COOKIE);
}
