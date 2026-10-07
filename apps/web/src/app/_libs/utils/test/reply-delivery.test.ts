import { describe, expect, test } from "vitest";

import { getReplyDeliveryState } from "@/app/_libs/utils/reply-delivery";

describe("getReplyDeliveryState", () => {
  test("is null for a draft that is not approved", () => {
    for (const status of ["pending_approval", "rejected", "superseded"] as const) {
      expect(getReplyDeliveryState({ status, postedAt: null, errorMessage: null })).toBeNull();
    }
  });

  test("an approved draft with neither a post time nor an error has not been posted", () => {
    expect(getReplyDeliveryState({ status: "approved", postedAt: null, errorMessage: null })).toBe(
      "not_posted",
    );
  });

  test("an approved draft with a post time is posted", () => {
    expect(
      getReplyDeliveryState({
        status: "approved",
        postedAt: "2026-01-01T00:00:00.000Z",
        errorMessage: null,
      }),
    ).toBe("posted");
  });

  test("an approved draft with an error and no post time failed", () => {
    expect(
      getReplyDeliveryState({ status: "approved", postedAt: null, errorMessage: "Google 429" }),
    ).toBe("failed");
  });
});
