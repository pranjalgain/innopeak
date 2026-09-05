import { MOCK_TENANT_MEMBERS } from "@/app/_libs/mock-data/tenant-members";
import type { TenantMember } from "@/types/domain";

/**
 * Tenant team members — mirrors the real `users` table (`apps/backend`'s
 * `0002_tenant_auth.sql`), gated behind `FEATURE_FLAGS.inviteMembers` in the
 * UI. Mock implementation — becomes a real backend call once the auth
 * module exists. Hooks/components only ever call `useTenantMembers`, never
 * this class directly.
 */
export class TenantMemberService {
  static async getMembers(): Promise<TenantMember[]> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_TENANT_MEMBERS;
  }

  static async inviteMember(email: string): Promise<TenantMember> {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const member: TenantMember = {
      id: `user_${Date.now()}`,
      name: email.split("@")[0] ?? email,
      email,
      role: "member",
      status: "invited",
      invitedAt: new Date().toISOString(),
    };
    MOCK_TENANT_MEMBERS.push(member);
    return member;
  }

  /** Only meaningful for a still-`invited` member — revokes their pending invite. */
  static async revokeInvite(id: string): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const index = MOCK_TENANT_MEMBERS.findIndex((member) => member.id === id);
    if (index !== -1) MOCK_TENANT_MEMBERS.splice(index, 1);
  }
}
