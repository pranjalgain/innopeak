import { AdminBillingControllerListWebhookEventsV1TypeEnum } from "@innopeak/client-sdk";
import { describe, expect, it } from "vitest";

import { StripeWebhookEventType } from "@/types/domain";

describe("StripeWebhookEventType", () => {
  it("stays in sync with the backend's own key vocabulary", () => {
    // `StripeWebhookEventType` here is a hand-maintained copy of the backend's own const object
    // (apps/backend/src/api/billing/types/billing.type.ts) — nothing generates it, unlike this
    // enum, which the OpenAPI client regenerates straight from the backend's Swagger doc every
    // time `pnpm run generate:client` runs. Comparing this file's key set against that generated
    // enum's values is what catches the two drifting apart: a new handled Stripe event type added
    // backend-side, with this file's copy forgotten in the same change, would otherwise pass every
    // other check silently and just quietly break the webhook-events filter dropdown.
    const handCopiedKeys = Object.keys(StripeWebhookEventType).sort();
    const generatedKeys = Object.values(AdminBillingControllerListWebhookEventsV1TypeEnum).sort();

    expect(handCopiedKeys).toEqual(generatedKeys);
  });
});
