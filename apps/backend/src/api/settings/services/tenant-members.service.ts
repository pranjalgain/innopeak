import { UserStatus } from '@auth/enums/user-status.enum';
import { EmailAlreadyRegisteredException } from '@auth/exceptions/auth.exceptions';
import { buildMemberInviteLink } from '@auth/utils/member-invite-link.util';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { hashToken } from '@auth/utils/token.utils';
import { JobName } from '@bg/constants/job.constant';
import type { IMemberInviteEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { TeamMemberLimitReachedException } from '@billing/exceptions/billing.exceptions';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { getErasureGracePeriodDays } from '@common/constants/erasure.constants';
import { MESSAGES } from '@common/constants/messages.constants';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import type { AuthUser } from '../../auth/types/auth.type';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { TenantMemberResponseDto } from '../dto/tenant-member-response.dto';
import {
  CannotRemoveLastOwnerException,
  CannotRemoveSelfException,
  MemberEmailAlreadyInvitedException,
  MemberInviteNotRevocableException,
  MemberInvitesDisabledException,
  MemberNotFoundException,
  MemberRemovalNotPendingException,
} from '../exceptions/settings.exceptions';

// Same product default as `AdminSettingsService`'s `INVITE_TTL_DAYS`, deliberately not shared.
const INVITE_TTL_DAYS = 7;

/**
 * Invite tokens live on `password_reset_tokens` (`purpose = 'invite'`), not a dedicated table.
 * Accepting an invite is `AuthService`'s job: the invitee has no session, so it can't sit behind
 * this owner-gated controller.
 */
@Injectable()
export class TenantMembersService {
  private readonly logger = new Logger(TenantMembersService.name);

  constructor(
    private readonly authDbService: AuthDbService,
    private readonly platformSettingsDbService: PlatformSettingsDbService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly queueManager: AddingJobsToQueueManager,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  async listMembers(actor: AuthUser): Promise<TenantMemberResponseDto[]> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);
    const rows = await this.authDbService.listTenantMembers(owner.tenantId);
    return rows.map(row => TenantMemberResponseDto.from(row));
  }

  async sendInvite(actor: AuthUser, dto: InviteMemberDto): Promise<TenantMemberResponseDto> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);

    const platformSettings = await this.platformSettingsDbService.get();
    if (platformSettings?.inviteMembersEnabled !== true) {
      throw new MemberInvitesDisabledException();
    }

    // Distinct from the platform-off exception: the frontend shows different upsell copy for plan-locked vs platform-locked.
    if (!(await this.billingEntitlementsService.canInviteTeamMember(owner.tenantId))) {
      throw new TeamMemberLimitReachedException();
    }

    // Global, not tenant-scoped: `idx_users_email_active` allows one non-anonymized account per email
    // across every tenant, so a claimed email is refused up front rather than found as a raw 23505.
    const existing = await this.authDbService.findMemberInviteStatusByEmail(dto.email);
    if (existing) {
      // A lapsed invite is not a live claim; re-inviting replaces it. A null expiry counts as lapsed:
      // the nightly `AUTH_TOKEN_CLEANUP` deletes the token of an expired invite but leaves this row,
      // which nobody can redeem. Status-gated because a self-signed-up owner also has a null expiry
      // and must keep answering "already registered".
      const isLapsedInvite =
        existing.status === UserStatus.INVITED &&
        (existing.inviteExpiresAt === null ||
          new Date(existing.inviteExpiresAt).getTime() <= Date.now());

      if (!isLapsedInvite) {
        if (existing.status === UserStatus.INVITED) {
          throw new MemberEmailAlreadyInvitedException();
        }
        throw new EmailAlreadyRegisteredException();
      }

      // Cascades to the token row. Scoped to `status = 'invited'`, so a racing acceptance is a no-op
      // and the insert below fails on the unique email index rather than clobbering a real account.
      await this.authDbService.deleteExpiredMemberInvite(existing.id);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // The lookup is read-then-write: a concurrent duplicate still hits `idx_users_email_active`, mapped to the same conflict.
    let member;
    try {
      member = await this.authDbService.createMemberInvite({
        tenantId: owner.tenantId,
        invitedByUserId: owner.id,
        email: dto.email,
        tokenHash: hashToken(rawToken),
        expiresAt,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MemberEmailAlreadyInvitedException();
      }
      throw error;
    }

    // Fetched only for `name`; suspension is not checked here because `assertGoodStanding` blocks sign-in.
    const tenant = await this.authDbService.findTenantStatus(owner.tenantId);
    this.sendInviteEmail({
      email: dto.email,
      rawToken,
      // Fallback rather than a throw: a generic invite email beats failing the invite over a cosmetic detail.
      businessName: tenant?.name ?? 'your team',
    });

    return TenantMemberResponseDto.from(member);
  }

  /** Unknown id is a 404, but an already-accepted member is a 409: they are visible in the roster, so "not found" would be wrong. */
  async revokeInvite(actor: AuthUser, memberId: string): Promise<void> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);
    const revoked = await this.authDbService.revokeMemberInvite(owner.tenantId, memberId);

    if (revoked.outcome === 'not_found') {
      throw new MemberNotFoundException();
    }
    if (revoked.outcome === 'not_invited') {
      throw new MemberInviteNotRevocableException();
    }
  }

  /** Disables access immediately; anonymization is deferred to the nightly `ERASURE_PURGE` after the grace period. Self-removal is refused before any DB round trip. */
  async requestRemoval(actor: AuthUser, memberId: string): Promise<{ gracePeriodDays: number }> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);

    if (memberId === owner.id) {
      throw new CannotRemoveSelfException();
    }

    const result = await this.authDbService.requestMemberRemoval(owner.tenantId, memberId);

    if (result.outcome === 'not_found') {
      throw new MemberNotFoundException();
    }
    if (result.outcome === 'last_owner') {
      throw new CannotRemoveLastOwnerException();
    }

    return { gracePeriodDays: this.gracePeriodDays() };
  }

  async cancelRemoval(actor: AuthUser, memberId: string): Promise<void> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);
    const result = await this.authDbService.cancelMemberRemoval(owner.tenantId, memberId);

    if (result.outcome === 'not_found') {
      throw new MemberNotFoundException();
    }
    if (result.outcome === 'not_pending') {
      throw new MemberRemovalNotPendingException();
    }
  }

  private gracePeriodDays(): number {
    return getErasureGracePeriodDays(this.configService);
  }

  /** Fire-and-forget: the transaction that created the invite already committed. */
  private sendInviteEmail(input: { email: string; rawToken: string; businessName: string }): void {
    const inviteLink = buildMemberInviteLink(
      this.configService.get<string>('FRONTEND_URL'),
      input.rawToken
    );

    if (!isProduction()) {
      this.logger.log(`[dev] Member invite for ${input.email}: ${inviteLink}`);
    }

    const job: IMemberInviteEmailJob = {
      email: input.email,
      inviteLink,
      expiresIn: `${INVITE_TTL_DAYS} days`,
      businessName: input.businessName,
    };
    void this.queueManager
      .addMemberInviteEmailJob(JobName.MEMBER_INVITE_EMAIL, job)
      .catch(() => undefined);
  }
}
