import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, test } from "vitest";

import type { Tenant } from "@/types/domain";

import messages from "../../../../../../messages/en.json";
import { BusinessProfileCard } from "../business-profile-card";

const copy = messages.dashboard.businessProfile;

type Location = NonNullable<Tenant["location"]>;

/** A connected location with nothing optional filled in; each test sets only what it is about. */
function location(overrides: Partial<Location> = {}): Location {
  return {
    name: "The Coastal Table",
    address: null,
    phone: null,
    websiteUri: null,
    category: null,
    googleRating: null,
    googleReviewCount: null,
    lastSyncedAt: null,
    syncStatus: null,
    ...overrides,
  };
}

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
      location: location({
        address: "214 Harbor St, Portland, ME",
        phone: null,
        websiteUri: null,
        lastSyncedAt: "2026-10-05T12:00:00.000Z",
      }),
    });

    expect(screen.getByText("The Coastal Table")).toBeTruthy();
    expect(screen.getByText("214 Harbor St, Portland, ME")).toBeTruthy();
    expect(screen.getByText(/Last synced/)).toBeTruthy();
  });

  test("says so when the location has no address or has never synced", () => {
    renderCard({
      name: "Verify Bistro",
      location: location({
        address: null,
        phone: null,
        websiteUri: null,
        lastSyncedAt: null,
      }),
    });

    expect(screen.getByText(copy.noAddress)).toBeTruthy();
    expect(screen.getByText(copy.neverSynced)).toBeTruthy();
  });

  test("shows the phone and website the business lists on Google, as links", () => {
    renderCard({
      name: "Verify Bistro",
      location: location({
        address: null,
        phone: "+1 207-555-0142",
        websiteUri: "https://coastaltable.example/",
        lastSyncedAt: null,
      }),
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
      location: location({
        address: null,
        phone: null,
        websiteUri: "javascript:alert(1)",
        lastSyncedAt: null,
      }),
    });

    expect(screen.queryByRole("link")).toBeNull();
  });

  test("leaves out phone and website when the business lists none", () => {
    renderCard({
      name: "Verify Bistro",
      location: location({
        address: null,
        phone: null,
        websiteUri: null,
        lastSyncedAt: null,
      }),
    });

    expect(screen.queryByRole("link")).toBeNull();
  });

  test("says no location is connected when there is none", () => {
    renderCard({ name: "Verify Bistro", location: null });

    expect(screen.getByText(copy.noLocation)).toBeTruthy();
  });

  test("shows the business's category", () => {
    renderCard({ name: "Verify Bistro", location: location({ category: "Restaurant" }) });

    expect(screen.getByText("Category: Restaurant")).toBeTruthy();
    expect(screen.getByText("Restaurant")).toBeTruthy();
  });

  test("shows Google's rating with one decimal and the review count", () => {
    renderCard({
      name: "Verify Bistro",
      location: location({ googleRating: 4.3, googleReviewCount: 1212 }),
    });

    expect(screen.getByText("4.3")).toBeTruthy();
    expect(screen.getByText("(1,212)")).toBeTruthy();
    expect(
      screen.getByText("Rated 4.3 out of 5 on Google, from 1,212 reviews"),
    ).toBeTruthy();
  });

  test("pads a whole-number rating to one decimal, and says 'review' for one", () => {
    renderCard({
      name: "Verify Bistro",
      location: location({ googleRating: 5, googleReviewCount: 1 }),
    });

    expect(screen.getByText("5.0")).toBeTruthy();
    expect(screen.getByText("Rated 5.0 out of 5 on Google, from 1 review")).toBeTruthy();
  });

  test("shows a rating without a count when Google sent no count", () => {
    renderCard({ name: "Verify Bistro", location: location({ googleRating: 4.1 }) });

    expect(screen.getByText("Rated 4.1 out of 5 on Google")).toBeTruthy();
    expect(screen.queryByText(/^\(/)).toBeNull();
  });

  // A plain span cannot be given an accessible name, so the sentence is real (visually hidden) text and the short visible form is
  // kept from assistive technology, which would otherwise read both.
  test("gives screen readers the full sentence as text, not as an aria-label on a span", () => {
    renderCard({
      name: "Verify Bistro",
      location: location({ category: "Restaurant", googleRating: 4.3, googleReviewCount: 212 }),
    });

    for (const sentence of ["Category: Restaurant", "Rated 4.3 out of 5 on Google, from 212 reviews"]) {
      expect(screen.getByText(sentence).className).toContain("sr-only");
    }
    expect(screen.getByText("Restaurant").getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("4.3").closest("[aria-hidden=true]")).not.toBeNull();
    expect(document.querySelector("span[aria-label]")).toBeNull();
  });

  test("leaves out category and rating until a sync has read them", () => {
    renderCard({ name: "Verify Bistro", location: location() });

    expect(screen.queryByText(/^Category:/)).toBeNull();
    expect(screen.queryByText(/out of 5 on Google/)).toBeNull();
  });

  describe("sync status", () => {
    test("a healthy sync shows a green badge", () => {
      renderCard({
        name: "Verify Bistro",
        location: location({ lastSyncedAt: "2026-10-05T12:00:00.000Z", syncStatus: "ok" }),
      });

      expect(screen.getByText(copy.syncOk)).toBeTruthy();
      expect(screen.queryByText(copy.syncFailed)).toBeNull();
    });

    test("a failed sync says so and explains on hover that new reviews may be missing", () => {
      renderCard({
        name: "Verify Bistro",
        location: location({ lastSyncedAt: "2026-10-05T12:00:00.000Z", syncStatus: "error" }),
      });

      const badge = screen.getByText(copy.syncFailed);
      expect(badge).toBeTruthy();
      expect(badge.getAttribute("title")).toBe(copy.syncFailedHint);
      expect(screen.queryByText(copy.syncOk)).toBeNull();
    });

    test("shows no badge before the first sync has run", () => {
      renderCard({ name: "Verify Bistro", location: location({ syncStatus: null }) });

      expect(screen.queryByText(copy.syncOk)).toBeNull();
      expect(screen.queryByText(copy.syncFailed)).toBeNull();
    });
  });
});
