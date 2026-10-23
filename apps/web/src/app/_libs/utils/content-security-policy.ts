/** Where the app's own avatars are served from (Cloudinary), and where the browser uploads them to. */
const CLOUDINARY_IMAGE_ORIGIN = "https://res.cloudinary.com";
const CLOUDINARY_UPLOAD_ORIGIN = "https://api.cloudinary.com";

/** Stripe Elements (the card form): its script, its iframes and the calls those make. */
const STRIPE_SCRIPT_ORIGIN = "https://js.stripe.com";
const STRIPE_FRAME_ORIGINS = ["https://js.stripe.com", "https://hooks.stripe.com", "https://m.stripe.network"];
const STRIPE_CONNECT_ORIGINS = ["https://api.stripe.com", "https://r.stripe.com"];

export interface ContentSecurityPolicyOptions {
  /** A fresh, unguessable value for this one response; see `generateNonce`. */
  nonce: string;
  /** React's development build evaluates strings (call stack reconstruction), which `script-src` refuses without `'unsafe-eval'`. */
  isDevelopment: boolean;
  /** Sentry's ingest origin when the browser SDK posts to it directly (it is same-origin when the tunnel route is on). */
  sentryDsn?: string | undefined;
}

/** A base64 UUID: 122 random bits, drawn per request, never reused. Web Crypto only, so it runs in the edge proxy. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The page's Content-Security-Policy. The point is `script-src`: only the scripts this response's own markup carries (the framework's,
 * stamped with the nonce) run, and `'strict-dynamic'` lets those load their own chunks, so an injected `<script>` or a hostile `src`
 * runs nothing. The rest narrows where a script that did run could send data (`connect-src`) and what the page may embed.
 *
 * `style-src` keeps `'unsafe-inline'`: the UI libraries set `style` attributes at runtime, which a nonce cannot cover, and styles cannot run
 * code. `object-src`, `base-uri`, `form-action` and `frame-ancestors` repeat the static policy in `next.config.ts`: on a page this header
 * replaces that one, so it has to carry them itself. `'strict-dynamic'` trusts scripts that trusted code creates, so this stops injected
 * *markup* (a reflected or stored tag, an `onerror=` attribute), not a script-creating sink in the app's own code.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  sentryDsn,
}: ContentSecurityPolicyOptions): string {
  const sentryOrigin = originOf(sentryDsn);

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // The origin entry is for browsers without `'strict-dynamic'`; with it, a host source is ignored.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      STRIPE_SCRIPT_ORIGIN,
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", CLOUDINARY_IMAGE_ORIGIN, "https://*.stripe.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      CLOUDINARY_UPLOAD_ORIGIN,
      ...STRIPE_CONNECT_ORIGINS,
      ...(sentryOrigin ? [sentryOrigin] : []),
      // The dev server's hot reload talks over a websocket.
      ...(isDevelopment ? ["ws:", "wss:"] : []),
    ],
    "frame-src": STRIPE_FRAME_ORIGINS,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  };

  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .concat(isDevelopment ? [] : ["upgrade-insecure-requests"])
    .join("; ");
}
