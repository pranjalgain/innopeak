/**
 * Mints a JWT-*shaped* string — never a real, signed token. `TokenService.decode` (the real
 * frontend code, unmodified) base64url-decodes the middle segment to read `email`/`type`/`exp`
 * for display and routing only; nothing anywhere verifies a signature client-side, and there is no
 * real backend for one to matter to. The header and signature segments are fixed, meaningless
 * strings that exist purely so the token still has three dot-separated parts to split.
 */

const FAKE_HEADER = "mock"; // stands in for base64url(JSON.stringify({ alg: "none", typ: "JWT" }))
const FAKE_SIGNATURE = "mock-signature";

function base64UrlEncode(value: string): string {
  const base64 =
    typeof window === "undefined"
      ? Buffer.from(value, "utf-8").toString("base64")
      : window.btoa(unescape(encodeURIComponent(value)));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface MockAccessTokenClaims {
  email: string;
  type: "tenant_user" | "platform_admin";
  ttlSeconds: number;
}

/** A fake access token carrying exactly the claims `TokenService.decode` reads: `email`, `type`, `exp`. */
export function mintAccessToken({ email, type, ttlSeconds }: MockAccessTokenClaims): string {
  const payload = base64UrlEncode(
    JSON.stringify({ email, type, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  );
  return `${FAKE_HEADER}.${payload}.${FAKE_SIGNATURE}`;
}

/** Access tokens in this mock live long enough that the 15-minute real-world refresh dance never
 *  has to fire mid-demo — nobody watching a preview should see a session drop. */
export const MOCK_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 12;
