import { beforeEach, describe, expect, it, vi } from "vitest";

import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { TenantMemberService } from "@/app/_libs/services/tenant-member.service";

function envelope<T>(data: T) {
  return { data: { status: "Success", data } };
}

const MEMBER = {
  id: "user-1",
  name: "sam.rivera@thecoffeehouse.com",
  email: "sam.rivera@thecoffeehouse.com",
  role: "member" as const,
  status: "invited" as const,
  invitedAt: "2026-03-01T09:12:00.000Z",
};

describe("TenantMemberService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getMembers lists the tenant's roster", async () => {
    vi.spyOn(settingsApi, "tenantMembersControllerListV1").mockResolvedValue(
      envelope([MEMBER]) as never,
    );

    await expect(TenantMemberService.getMembers()).resolves.toEqual([MEMBER]);
  });

  it("inviteMember sends the invite and returns the new roster row", async () => {
    vi.spyOn(settingsApi, "tenantMembersControllerInviteV1").mockResolvedValue(
      envelope(MEMBER) as never,
    );

    const result = await TenantMemberService.inviteMember("sam.rivera@thecoffeehouse.com");

    expect(settingsApi.tenantMembersControllerInviteV1).toHaveBeenCalledWith({
      inviteMemberDto: { email: "sam.rivera@thecoffeehouse.com" },
    });
    expect(result).toEqual(MEMBER);
  });

  it("revokeInvite calls the revoke endpoint with the member id", async () => {
    vi.spyOn(settingsApi, "tenantMembersControllerRevokeV1").mockResolvedValue(
      envelope({ message: "Invite revoked." }) as never,
    );

    await TenantMemberService.revokeInvite("user-1");

    expect(settingsApi.tenantMembersControllerRevokeV1).toHaveBeenCalledWith({
      memberId: "user-1",
    });
  });
});
