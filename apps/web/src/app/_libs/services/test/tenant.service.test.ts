import { beforeEach, describe, expect, it, vi } from "vitest";

import { type ConnectedLocation, ConnectionService } from "@/app/_libs/services/connection.service";
import { TenantOwnerProfileService } from "@/app/_libs/services/tenant-owner-profile.service";
import { TenantService } from "@/app/_libs/services/tenant.service";

const LOCATION: ConnectedLocation = {
  id: "loc-1",
  provider: "google",
  externalLocationId: "locations/1",
  businessName: "The Coastal Table",
  address: "214 Harbor St, Portland, ME",
  phone: "+1 207-555-0142",
  websiteUri: "https://coastaltable.example",
  category: "Restaurant",
  googleRating: 4.3,
  googleReviewCount: 212,
  status: "active",
  lastSyncedAt: "2026-10-05T12:00:00.000Z",
  lastSyncStatus: "ok",
  lastSyncError: null,
  onboardingBackfillCompletedAt: null,
  billingPausedAt: null,
};

function mockSources(location: ConnectedLocation | null) {
  vi.spyOn(TenantOwnerProfileService, "get").mockResolvedValue({
    businessName: "Verify Bistro",
  } as Awaited<ReturnType<typeof TenantOwnerProfileService.get>>);
  vi.spyOn(ConnectionService, "getState").mockResolvedValue({
    status: location ? "connected" : "disconnected",
    connectionId: null,
    providerAccountId: null,
    connectedAt: null,
    location,
  });
}

describe("TenantService.getCurrentTenant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("combines the business name with the connected location's real name, address, contact details, Google rating and sync state", async () => {
    mockSources(LOCATION);

    await expect(TenantService.getCurrentTenant()).resolves.toEqual({
      name: "Verify Bistro",
      location: {
        name: "The Coastal Table",
        address: "214 Harbor St, Portland, ME",
        phone: "+1 207-555-0142",
        websiteUri: "https://coastaltable.example",
        category: "Restaurant",
        googleRating: 4.3,
        googleReviewCount: 212,
        lastSyncedAt: "2026-10-05T12:00:00.000Z",
        syncStatus: "ok",
      },
    });
  });

  // A location whose first sync has not read Google's category and rating (or an older API) is shown without them, not as zero.
  it("reads a location without category and rating as having none", async () => {
    const { category: _c, googleRating: _r, googleReviewCount: _n, ...withoutGoogleFigures } = LOCATION;
    mockSources(withoutGoogleFigures);

    const tenant = await TenantService.getCurrentTenant();

    expect(tenant.location).toEqual(
      expect.objectContaining({ category: null, googleRating: null, googleReviewCount: null }),
    );
  });

  it("passes on a failed sync so the card can say so", async () => {
    mockSources({ ...LOCATION, lastSyncStatus: "error", lastSyncError: "Google answered 500" });

    const tenant = await TenantService.getCurrentTenant();

    expect(tenant.location).toEqual(expect.objectContaining({ syncStatus: "error" }));
  });

  it("reads a location without contact details as having none", async () => {
    const { phone: _phone, websiteUri: _websiteUri, ...withoutContact } = LOCATION;
    mockSources(withoutContact);

    const tenant = await TenantService.getCurrentTenant();

    expect(tenant.location).toEqual(expect.objectContaining({ phone: null, websiteUri: null }));
  });

  it("has no location when nothing is connected", async () => {
    mockSources(null);

    await expect(TenantService.getCurrentTenant()).resolves.toEqual({
      name: "Verify Bistro",
      location: null,
    });
  });

  it("ignores a deactivated location", async () => {
    mockSources({ ...LOCATION, status: "inactive" });

    const tenant = await TenantService.getCurrentTenant();

    expect(tenant.location).toBeNull();
  });
});
