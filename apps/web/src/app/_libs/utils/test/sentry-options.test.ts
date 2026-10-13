import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, test } from "vitest";

import { safeRequestHeaders, scrubEvent, sentryOptions } from "../sentry-options";

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
