import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import type { Tenant } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { BusinessProfileCard } from "../business-profile-card";

const copy = messages.dashboard.businessProfile;

function renderCard(tenant: Tenant) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <BusinessProfileCard tenant={tenant} />
    </NextIntlClientProvider>,
  );
}

describe("BusinessProfileCard", () => {
  test("shows the connected location's name, address and last sync time", () => {
    renderCard({
      name: "Verify Bistro",
      location: {
        name: "The Coastal Table",
        address: "214 Harbor St, Portland, ME",
        lastSyncedAt: "2026-10-05T12:00:00.000Z",
      },
    });

    expect(screen.getByText("The Coastal Table")).toBeTruthy();
    expect(screen.getByText("214 Harbor St, Portland, ME")).toBeTruthy();
    expect(screen.getByText(/Last synced/)).toBeTruthy();
  });

  test("says so when the location has no address or has never synced", () => {
    renderCard({
      name: "Verify Bistro",
      location: { name: "The Coastal Table", address: null, lastSyncedAt: null },
    });

    expect(screen.getByText(copy.noAddress)).toBeTruthy();
    expect(screen.getByText(copy.neverSynced)).toBeTruthy();
  });

  test("says no location is connected when there is none", () => {
    renderCard({ name: "Verify Bistro", location: null });

    expect(screen.getByText(copy.noLocation)).toBeTruthy();
  });
});
