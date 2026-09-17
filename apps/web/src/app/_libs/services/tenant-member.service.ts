import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { TenantMember } from "@/types/domain";

/**
 * Tenant team members — real backend calls against `/v1/settings/members`
 * (`apps/backend`'s `TenantMembersController`), gated behind the platform's
 * `inviteMembersEnabled` setting in the UI (and enforced server-side on invite — see
 * `apps/documentation/docs/backend/auth/tenant-member-invite-design.md`). Hooks/components only
 * ever call `useTenantMembers`, never this class directly.
 */
export class TenantMemberService {
  static async getMembers(): Promise<TenantMember[]> {
    const response = await settingsApi.tenantMembersControllerListV1();
    return unwrap<TenantMember[]>(response.data);
  }

  /** Throws `ApiError` on 403 (invites disabled platform-wide) or 409 (a live invite, or a real account, already exists for this email). */
  static async inviteMember(email: string): Promise<TenantMember> {
    const response = await settingsApi.tenantMembersControllerInviteV1({
      inviteMemberDto: { email },
    });
    return unwrap<TenantMember>(response.data);
  }

  /** Only meaningful for a still-`invited` member — revokes their pending invite. Throws `ApiError` on 404/409. */
  static async revokeInvite(id: string): Promise<void> {
    await settingsApi.tenantMembersControllerRevokeV1({ memberId: id });
  }
}
