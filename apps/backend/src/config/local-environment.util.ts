/**
 * Where the app is reachable decides whether a development convenience is safe. `NODE_ENV` only says "not production" and has just two
 * values, so a publicly reachable staging box running as `development` would otherwise accept the fixed sign-up code, log invite links and
 * set cookies without `Secure`. The frontend URL says where people actually come from.
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** `localhost`, any `*.localhost`, loopback addresses. */
function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    host === '::1' ||
    /^127(?:\.\d{1,3}){3}$/.test(host)
  );
}

/**
 * True when no URL is configured (a bare local setup) or its host is loopback. A malformed value counts as not local: refusing a
 * development convenience is the safe way to be wrong.
 */
export function isLocalUrl(url: string | null | undefined): boolean {
  if (url === undefined || url === null || url.trim() === '') {
    return true;
  }
  const host = hostOf(url);
  return host !== null && isLoopbackHost(host);
}

/** Whether the configured URL is served over https, so cookies set for it can and should be `Secure`. */
export function isHttpsUrl(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith('https://');
}
