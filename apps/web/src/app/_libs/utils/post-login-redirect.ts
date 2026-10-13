import { ROUTES } from "@/app/_libs/constants/routes";

/** Query parameter carrying the page a signed-out visitor was trying to reach. */
export const POST_LOGIN_REDIRECT_PARAM = "next";

/**
 * Only these areas may be returned to. Onboarding screens are excluded on purpose: where they send you depends on
 * account state (plan, connection), so replaying an old one after sign-in would skip steps.
 */
const TENANT_RETURN_PREFIXES = ["/dashboard", "/review-queue", "/settings"] as const;
const ADMIN_RETURN_PREFIXES = ["/admin"] as const;

function hasPrefix(path: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => path === prefix || /^[/?#]/.test(path.slice(prefix.length)));
}

/**
 * A same-origin path inside one of `prefixes`, or `null`. Anything else (another origin, a protocol-relative `//host`,
 * a backslash trick, a path outside the allowed areas) is ignored, so the parameter can never become an open redirect.
 */
function safePath(raw: string | null, prefixes: readonly string[]): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  const path = raw.split(/[?#]/)[0] ?? "";
  return hasPrefix(path, prefixes) && !/\/\.\.?(\/|$)/.test(path) ? raw : null;
}

export function safeTenantReturnPath(raw: string | null): string | null {
  return safePath(raw, TENANT_RETURN_PREFIXES);
}

export function safeAdminReturnPath(raw: string | null): string | null {
  return safePath(raw, ADMIN_RETURN_PREFIXES);
}

/** The path (with query) a guarded route was requested at, for the sign-in redirect; `null` when it is not worth returning to. */
export function returnPathFor(
  pathname: string,
  search: string,
  kind: "tenant" | "admin",
): string | null {
  const candidate = `${pathname}${search}`;
  return kind === "tenant" ? safeTenantReturnPath(candidate) : safeAdminReturnPath(candidate);
}

/**
 * Where to send a signed-in visitor whose session just lapsed (refresh failed), remembering the page they were on. `null` when
 * they are not on a guarded page (marketing, onboarding, sign-in screens), where bouncing them would only be disruptive.
 */
export function signInPathFor(
  kind: "tenant" | "admin",
  pathname: string,
  search: string,
): string | null {
  const returnTo = returnPathFor(pathname, search, kind);
  if (!returnTo) return null;
  const base = kind === "admin" ? ROUTES.ADMIN_LOGIN : ROUTES.LOGIN;
  return `${base}?${POST_LOGIN_REDIRECT_PARAM}=${encodeURIComponent(returnTo)}`;
}

/** The sign-in redirect target currently in the address bar, if it is a safe one for this kind of principal. */
export function readReturnPath(kind: "tenant" | "admin"): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(POST_LOGIN_REDIRECT_PARAM);
  return kind === "tenant" ? safeTenantReturnPath(raw) : safeAdminReturnPath(raw);
}
