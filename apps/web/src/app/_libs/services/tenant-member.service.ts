import { settingsApi } from "@/app/_libs/api-sdk/settings-api";
import { unwrap } from "@/app/_libs/services/api-error";
import type { TenantMember } from "@/types/domain";

// The SDK types this `object | null` (generator quirk with nullable `@ApiPropertyOptional` strings), so declare the real shape.
interface ApiTenantMember {
  id: string;
  name: string;
  email: string;
  role: TenantMember["role"];
  status: TenantMember["status"];
  invitedAt: string;
  erasureRequestedAt: string | null;
}

interface ApiRemovalResponse {
  message: string;
}

/** `inviteMembersEnabled` gates invites in the UI and is enforced server-side on invite. */
export class TenantMemberService {
  static async getMembers(): Promise<TenantMember[]> {
    const response = await settingsApi.tenantMembersControllerListV1();
    return unwrap<ApiTenantMember[]>(response.data);
  }

  /** Throws `ApiError` on 403 (invites disabled platform-wide) or 409 (a live invite, or a real account, already exists for this email). */
  static async inviteMember(email: string): Promise<TenantMember> {
    const response = await settingsApi.tenantMembersControllerInviteV1({
      inviteMemberDto: { email },
    });
    return unwrap<ApiTenantMember>(response.data);
  }

  /** Only meaningful for a still-`invited` member — revokes their pending invite. Throws `ApiError` on 404/409. */
  static async revokeInvite(id: string): Promise<void> {
    await settingsApi.tenantMembersControllerRevokeV1({ memberId: id });
  }

  /** Revokes access immediately; anonymization is deferred to a nightly job (`ERASURE_GRACE_PERIOD_DAYS`). Throws `ApiError` on 400 (last owner or self-removal) or 404. */
  static async requestRemoval(id: string): Promise<string> {
    const response = await settingsApi.tenantMembersControllerRequestRemovalV1({ memberId: id });
    return unwrap<ApiRemovalResponse>(response.data).message;
  }

  /** Undoes `requestRemoval` — restores access. Throws `ApiError` on 404/409 (nothing pending). */
  static async cancelRemoval(id: string): Promise<void> {
    await settingsApi.tenantMembersControllerCancelRemovalV1({ memberId: id });
  }
}
