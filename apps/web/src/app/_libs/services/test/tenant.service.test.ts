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

  it("combines the business name with the connected location's real name, address and sync time", async () => {
    mockSources(LOCATION);

    await expect(TenantService.getCurrentTenant()).resolves.toEqual({
      name: "Verify Bistro",
      location: {
        name: "The Coastal Table",
        address: "214 Harbor St, Portland, ME",
        lastSyncedAt: "2026-10-05T12:00:00.000Z",
      },
    });
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
