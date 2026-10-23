import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, test } from "vitest";

import { safeRequestHeaders, scrubEvent, scrubUrl, sentryOptions } from "../sentry-options";

describe("sentryOptions", () => {
  // Regression: the DSN was hard-coded to the starter template's Sentry account, so production errors went to a third party.
  test("is off without a DSN", () => {
    expect(sentryOptions(undefined)).toBeNull();
    expect(sentryOptions("")).toBeNull();
  });

  test("never sends default PII, logs or traces unless a rate is given", () => {
    const options = sentryOptions("https://key@o1.ingest.sentry.io/1");

    expect(options).toMatchObject({ sendDefaultPii: false, enableLogs: false, tracesSampleRate: 0 });
  });
});

describe("safeRequestHeaders", () => {
  // Regression: every request header, cookies and Authorization included, was attached to server-side error reports.
  test("keeps an allow-list and drops credentials", () => {
    const headers = new Headers({
      cookie: "access_token=secret; refresh_token=secret2",
      authorization: "Bearer secret",
      "user-agent": "Mozilla/5.0",
      "accept-language": "de",
      "x-forwarded-for": "10.0.0.1",
    });

    expect(safeRequestHeaders(headers)).toEqual({ "user-agent": "Mozilla/5.0", "accept-language": "de" });
  });
});

describe("the Referer header", () => {
  const referer = "https://app.example.com/accept-invite/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdefg?next=%2Fsettings";

  // The page a request came from carries the same single-use invite token or Stripe session id as the request's own URL.
  test("is scrubbed when headers are attached to a server-side report", () => {
    const safe = safeRequestHeaders(new Headers({ referer }));

    expect(safe["referer"]).toBe("https://app.example.com/accept-invite/[redacted]");
  });

  test("is scrubbed again on the event itself, whatever collected it", () => {
    const event = { request: { headers: { Referer: referer } } } as unknown as ErrorEvent;

    expect(scrubEvent(event).request?.headers?.["Referer"]).toBe(
      "https://app.example.com/accept-invite/[redacted]",
    );
  });
});

describe("scrubEvent", () => {
  test("removes cookies, credentials, query strings and personal identifiers", () => {
    const event = {
      request: {
        cookies: { access_token: "secret" },
        headers: { Cookie: "a=b", Authorization: "Bearer x", "User-Agent": "UA" },
        query_string: "q=Maria+Schmidt",
        url: "https://app.example/review-queue",
      },
      user: { id: "u1", email: "a@b.de", ip_address: "1.2.3.4", username: "maria" },
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.headers).toEqual({ "User-Agent": "UA" });
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.user).toEqual({ id: "u1" });
  });

  test("passes an event with no request or user through untouched", () => {
    const event = { message: "boom" } as unknown as ErrorEvent;

    expect(scrubEvent(event)).toEqual({ message: "boom" });
  });
});

describe("scrubUrl", () => {
  test("drops the query string and fragment", () => {
    expect(scrubUrl("https://app.example.com/settings/billing?session_id=cs_live_a1B2c3D4e5F6g7H8i9J0&next=%2Fadmin#top")).toBe(
      "https://app.example.com/settings/billing",
    );
  });

  // An invite token is a credential: whoever holds the link can join the business.
  test("redacts an opaque path segment such as an invite token", () => {
    expect(scrubUrl("https://app.example.com/accept-invite/Zk3pQ9vLx2Rt7YwN4mBc8HdF1sAe6UjG5oVi0KxT2nM")).toBe(
      "https://app.example.com/accept-invite/[redacted]",
    );
    expect(scrubUrl("/review-queue/0190f3b2-7c1a-7d3e-9a41-5b6c8d9e0f12")).toBe("/review-queue/[redacted]");
  });

  test("leaves ordinary pages, and plain words however long, alone", () => {
    expect(scrubUrl("https://app.example.com/admin/businesses")).toBe("https://app.example.com/admin/businesses");
    expect(scrubUrl("/onboarding/business-name")).toBe("/onboarding/business-name");
    expect(scrubUrl("/settings/notification-preferences")).toBe("/settings/notification-preferences");
  });

  test("passes an empty value through", () => {
    expect(scrubUrl("")).toBe("");
  });
});

describe("scrubEvent — URLs", () => {
  test("cleans the request URL, the transaction name and the URLs in breadcrumbs", () => {
    const event = {
      request: { url: "https://app.example.com/accept-invite/Zk3pQ9vLx2Rt7YwN4mBc8HdF1sAe6UjG5oVi0KxT2nM?x=1" },
      transaction: "/accept-invite/Zk3pQ9vLx2Rt7YwN4mBc8HdF1sAe6UjG5oVi0KxT2nM",
      breadcrumbs: [
        { category: "navigation", data: { from: "/login?next=%2Fdashboard", to: "/settings?session_id=cs_live_a1B2c3D4e5F6g7H8" } },
        { category: "fetch", data: { url: "/v1/billing/checkout-sessions/cs_live_a1B2c3D4e5F6g7H8i9J0/reconcile", status_code: 200 } },
        { category: "console", message: "hello" },
      ],
    } as unknown as ErrorEvent;

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request?.url).toBe("https://app.example.com/accept-invite/[redacted]");
    expect(scrubbed.transaction).toBe("/accept-invite/[redacted]");
    expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({ from: "/login", to: "/settings" });
    expect(scrubbed.breadcrumbs?.[1]?.data).toEqual({
      url: "/v1/billing/checkout-sessions/[redacted]/reconcile",
      status_code: 200,
    });
    expect(scrubbed.breadcrumbs?.[2]).toEqual({ category: "console", message: "hello" });
  });
});
