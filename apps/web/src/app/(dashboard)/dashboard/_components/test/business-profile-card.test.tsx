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
        phone: null,
        websiteUri: null,
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
      location: {
        name: "The Coastal Table",
        address: null,
        phone: null,
        websiteUri: null,
        lastSyncedAt: null,
      },
    });

    expect(screen.getByText(copy.noAddress)).toBeTruthy();
    expect(screen.getByText(copy.neverSynced)).toBeTruthy();
  });

  test("shows the phone and website the business lists on Google, as links", () => {
    renderCard({
      name: "Verify Bistro",
      location: {
        name: "The Coastal Table",
        address: null,
        phone: "+1 207-555-0142",
        websiteUri: "https://coastaltable.example/",
        lastSyncedAt: null,
      },
    });

    const phone = screen.getByRole("link", { name: "Call +1 207-555-0142" });
    expect(phone.getAttribute("href")).toBe("tel:+12075550142");
    const website = screen.getByRole("link", { name: /Visit coastaltable\.example/ });
    expect(website.getAttribute("href")).toBe("https://coastaltable.example/");
    expect(website.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("coastaltable.example")).toBeTruthy();
  });

  test("never links a website that is not http(s)", () => {
    renderCard({
      name: "Verify Bistro",
      location: {
        name: "The Coastal Table",
        address: null,
        phone: null,
        websiteUri: "javascript:alert(1)",
        lastSyncedAt: null,
      },
    });

    expect(screen.queryByRole("link")).toBeNull();
  });

  test("leaves out phone and website when the business lists none", () => {
    renderCard({
      name: "Verify Bistro",
      location: {
        name: "The Coastal Table",
        address: null,
        phone: null,
        websiteUri: null,
        lastSyncedAt: null,
      },
    });

    expect(screen.queryByRole("link")).toBeNull();
  });

  test("says no location is connected when there is none", () => {
    renderCard({ name: "Verify Bistro", location: null });

    expect(screen.getByText(copy.noLocation)).toBeTruthy();
  });
});
