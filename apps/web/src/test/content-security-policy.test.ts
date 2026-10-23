import { describe, expect, test } from "vitest";

import { buildContentSecurityPolicy, generateNonce } from "@/app/_libs/utils/content-security-policy";

const build = (overrides: Partial<Parameters<typeof buildContentSecurityPolicy>[0]> = {}): string =>
  buildContentSecurityPolicy({ nonce: "abc123", isDevelopment: false, ...overrides });

function directive(policy: string, name: string): string[] {
  const entry = policy.split("; ").find(part => part.startsWith(`${name} `));
  return entry ? entry.slice(name.length + 1).split(" ") : [];
}

describe("generateNonce", () => {
  test("is different every time", () => {
    expect(new Set(Array.from({ length: 50 }, generateNonce)).size).toBe(50);
  });

  test("is a header-safe base64 string", () => {
    expect(generateNonce()).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});

describe("buildContentSecurityPolicy", () => {
  test("lets only nonced scripts, and the scripts they load, run", () => {
    const scripts = directive(build(), "script-src");
    expect(scripts).toEqual(expect.arrayContaining(["'self'", "'nonce-abc123'", "'strict-dynamic'"]));
    // Neither is allowed to run an injected inline script.
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toContain("*");
  });

  test("allows string evaluation only in development, where React needs it", () => {
    expect(directive(build({ isDevelopment: true }), "script-src")).toContain("'unsafe-eval'");
  });

  test("puts the nonce it was given into the policy and nowhere else", () => {
    const policy = build({ nonce: "zzz" });
    expect(policy.match(/zzz/g)).toHaveLength(1);
  });

  test("names the origins the app really talks to, and no others, for connections", () => {
    expect(directive(build(), "connect-src")).toEqual([
      "'self'",
      "https://api.cloudinary.com",
      "https://api.stripe.com",
      "https://r.stripe.com",
    ]);
  });

  test("adds Sentry's ingest origin only when a DSN is configured", () => {
    const withDsn = build({ sentryDsn: "https://publickey@o123.ingest.sentry.io/456" });
    expect(directive(withDsn, "connect-src")).toContain("https://o123.ingest.sentry.io");
    expect(directive(build(), "connect-src").some(source => source.includes("sentry"))).toBe(false);
  });

  test("ignores a DSN that is not a URL instead of throwing", () => {
    expect(() => build({ sentryDsn: "not a url" })).not.toThrow();
    expect(directive(build({ sentryDsn: "not a url" }), "connect-src")).not.toContain("not");
  });

  test("allows the dev server's hot-reload socket only in development", () => {
    expect(directive(build({ isDevelopment: true }), "connect-src")).toContain("ws:");
    expect(directive(build(), "connect-src")).not.toContain("ws:");
  });

  test("allows avatar images from the image host and Stripe's card form frames, and nothing framed else", () => {
    const policy = build();
    expect(directive(policy, "img-src")).toContain("https://res.cloudinary.com");
    expect(directive(policy, "frame-src")).toEqual([
      "https://js.stripe.com",
      "https://hooks.stripe.com",
      "https://m.stripe.network",
    ]);
  });

  test("shuts out plugins, a changed base URL, cross-origin form posts and framing", () => {
    const policy = build();
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'self'"]);
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
  });

  test("upgrades insecure requests in production but not on a plain-http dev server", () => {
    expect(build().split("; ")).toContain("upgrade-insecure-requests");
    expect(build({ isDevelopment: true }).split("; ")).not.toContain("upgrade-insecure-requests");
  });
});
