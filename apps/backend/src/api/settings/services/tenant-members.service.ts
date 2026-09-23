import { UserStatus } from '@auth/enums/user-status.enum';
import { EmailAlreadyRegisteredException } from '@auth/exceptions/auth.exceptions';
import { buildMemberInviteLink } from '@auth/utils/member-invite-link.util';
import { requireTenantUser } from '@auth/utils/require-tenant-user.util';
import { hashToken } from '@auth/utils/token.utils';
import { JobName } from '@bg/constants/job.constant';
import type { IMemberInviteEmailJob } from '@bg/interfaces/job.interface';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { MESSAGES } from '@common/constants/messages.constants';
import { isProduction } from '@config/deployment-target.util';
import { EnvConfig } from '@config/env.config';
import { isUniqueViolation } from '@db/helpers/pg-error.util';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomBytes } from 'crypto';

import type { AuthUser } from '../../auth/types/auth-user.type';
import { InviteMemberDto } from '../dto/invite-member.dto';
import { TenantMemberResponseDto } from '../dto/tenant-member-response.dto';
import {
  MemberEmailAlreadyInvitedException,
  MemberInviteNotRevocableException,
  MemberInvitesDisabledException,
  MemberNotFoundException,
} from '../exceptions/settings.exceptions';

/** Matches `AdminSettingsService`'s own `INVITE_TTL_DAYS` — same product default, kept as its own
 *  module-local constant rather than shared, since the two invite flows have no other coupling. */
const INVITE_TTL_DAYS = 7;

/**
 * Tenant "Team members" — an owner inviting, listing, and revoking invites for their own tenant.
 * Mirrors `AdminSettingsService`'s invite trio (`sendInvite`/`listInvites`/`revokeInvite`), with
 * one structural difference: there is no separate invite-row table here, since the invite token
 * lives on `password_reset_tokens` (`purpose = 'invite'`) rather than a dedicated
 * `tenant_member_invites` table — see `tenant-member-invite-design.md` for why.
 *
 * Accepting an invite (password or Google) is `AuthService`'s job, not this one's — the invitee
 * has no session yet, so it can't live behind this `@Roles(UserRole.OWNER)`-gated controller. This
 * service only ever gets the invite out the door and manages the roster.
 */
@Injectable()
export class TenantMembersService {
  private readonly logger = new Logger(TenantMembersService.name);

  constructor(
    private readonly authDbService: AuthDbService,
    private readonly platformSettingsDbService: PlatformSettingsDbService,
    private readonly queueManager: AddingJobsToQueueManager,
    private readonly configService: ConfigService<EnvConfig>
  ) {}

  async listMembers(actor: AuthUser): Promise<TenantMemberResponseDto[]> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);
    const rows = await this.authDbService.listTenantMembers(owner.tenantId);
    return rows.map(row => TenantMemberResponseDto.from(row));
  }

  /**
   * Creates the invited member's row and its invite token, emails the invite link (or a
   * Google-SSO alternative — see `GET /v1/auth/invite/:token/google`), and returns the roster row.
   * Accepting either path is `AuthService.acceptMemberInvite`/`completeMemberInviteGoogle`'s job,
   * not this method's — this only gets the invite out the door.
   */
  async sendInvite(actor: AuthUser, dto: InviteMemberDto): Promise<TenantMemberResponseDto> {
    const owner = requireTenantUser(actor, MESSAGES.SETTINGS.TENANT_ONLY);

    const platformSettings = await this.platformSettingsDbService.get();
    if (platformSettings?.inviteMembersEnabled !== true) {
      throw new MemberInvitesDisabledException();
    }

    // Global lookup, not tenant-scoped — `idx_users_email_active` is a global uniqueness
    // guarantee (one non-anonymized account per email, across every tenant), so an email already
    // claimed anywhere — this tenant's own owner, a member of a different tenant, a self-signed-up
    // account — must be refused before the insert, not discovered as a raw 23505. See
    // `AuthRepository.findMemberInviteStatusByEmail`.
    const existing = await this.authDbService.findMemberInviteStatusByEmail(dto.email);
    if (existing) {
      // A lapsed invite is not a live claim on this address — see `AdminSettingsService.sendInvite`'s
      // own comment for the identical reasoning. Re-inviting replaces it, which is what "send
      // invite" already means to the owner clicking it.
      //
      // A missing expiry counts as lapsed, not as live. An `invited` row whose token row is gone
      // cannot be redeemed by anyone, and the nightly `AUTH_TOKEN_CLEANUP` sweep produces exactly
      // that state for every invite that expires unaccepted (`PURGEABLE_OTP_PURPOSES` covers
      // `invite`, and it deletes the token while leaving this row behind). Reading a null expiry as
      // a live invite stranded the address permanently: the link was dead, re-inviting answered
      // "already has a pending invite", and only a manual revoke could clear it.
      //
      // Status-gated, because a null expiry means something else entirely on a row that was never
      // invited — a self-signed-up owner has no invite token either, and must keep answering
      // "already registered" rather than being deleted and replaced.
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

      // Cascades to the invite token row. Safe against an accepted member: the delete is scoped to
      // `status = 'invited'`, so a race that accepts the invite in between is a no-op here and the
      // insert below then fails on the global unique email index rather than clobbering a real
      // account.
      await this.authDbService.deleteExpiredMemberInvite(existing.id);
    }

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // The lookup above is read-then-write, so two owners inviting the same address at once (or one
    // double-clicking) can both pass it and the second insert still hits `idx_users_email_active`.
    // That is the index doing its job; the caller sees the same conflict either way.
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

    // `findTenantStatus` was not otherwise needed on this path — `sendInvite` never checks
    // suspension, since an owner acting on a suspended tenant is a problem `assertGoodStanding`
    // already catches the moment they try to *sign in*, not something this route needs to
    // duplicate. It is fetched purely for `name`, to attribute the email to the actual business
    // rather than a generic "a team" — see `IMemberInviteEmailJob.businessName`'s own comment.
    const tenant = await this.authDbService.findTenantStatus(owner.tenantId);
    this.sendInviteEmail({
      email: dto.email,
      rawToken,
      // `tenant` is only ever null if `owner.tenantId` stopped existing between authenticating this
      // request and this query — the row an authenticated owner belongs to. Never observed; a
      // literal fallback rather than a thrown error, since a slightly generic invite email is a
      // fine outcome for a case that isn't expected to occur, and throwing here would fail the
      // whole invite over a cosmetic detail.
      businessName: tenant?.name ?? 'your team',
    });

    return TenantMemberResponseDto.from(member);
  }

  /**
   * The two failure modes answer differently: an unknown id is a 404, while an id that exists but
   * is no longer `invited` (already accepted) is a 409 — the member is still visible in the
   * roster, so telling the owner "not found" describes something they can plainly see is there.
   */
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

  /** Fire-and-forget, same shape as `AdminSettingsService.sendInviteEmail` — the transaction that created the invite already committed. */
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
