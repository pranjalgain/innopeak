import { AdminBillingControllerListWebhookEventsV1TypeEnum } from "@innopeak/client-sdk";
import { describe, expect, it } from "vitest";

import { StripeWebhookEventType } from "@/types/domain";

describe("StripeWebhookEventType", () => {
  it("stays in sync with the backend's own key vocabulary", () => {
    // `StripeWebhookEventType` is a hand-maintained copy of the backend's const object; comparing it with the generated
    // client enum catches a new backend event type being forgotten here, which would silently break the webhook-events
    // filter dropdown.
    const handCopiedKeys = Object.keys(StripeWebhookEventType).sort();
    const generatedKeys = Object.values(AdminBillingControllerListWebhookEventsV1TypeEnum).sort();

    expect(handCopiedKeys).toEqual(generatedKeys);
  });
});
