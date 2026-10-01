import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import type { TenantAuthUser } from '@auth/types/auth.type';
import { JobName } from '@bg/constants/job.constant';
import { AddingJobsToQueueManager } from '@bg/queue-add-manager';
import { TeamMemberLimitReachedException } from '@billing/exceptions/billing.exceptions';
import { BillingEntitlementsService } from '@billing/services/billing-entitlements.service';
import { MESSAGES } from '@common/constants/messages.constants';
import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { PlatformSettingsDbService } from '@db/repositories/platform-settings/platform-settings.db-service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { TenantMembersService } from './tenant-members.service';

const owner: TenantAuthUser = {
  type: JwtTokenType.TENANT_USER,
  id: 'owner-1',
  tenantId: 'tenant-1',
  email: 'owner@thecoffeehouse.com',
  role: UserRole.OWNER,
  locale: null,
};

describe('TenantMembersService', () => {
  let target: TenantMembersService;
  let authDbService: {
    listTenantMembers: jest.Mock;
    findMemberInviteStatusByEmail: jest.Mock;
    deleteExpiredMemberInvite: jest.Mock;
    createMemberInvite: jest.Mock;
    revokeMemberInvite: jest.Mock;
    findTenantStatus: jest.Mock;
    requestMemberRemoval: jest.Mock;
    cancelMemberRemoval: jest.Mock;
  };
  let platformSettingsDbService: { get: jest.Mock };
  let billingEntitlementsService: { canInviteTeamMember: jest.Mock };
  let queueManager: { addMemberInviteEmailJob: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    authDbService = {
      listTenantMembers: jest.fn(),
      findMemberInviteStatusByEmail: jest.fn(),
      deleteExpiredMemberInvite: jest.fn(),
      createMemberInvite: jest.fn(),
      revokeMemberInvite: jest.fn(),
      findTenantStatus: jest
        .fn()
        .mockResolvedValue({ status: TenantStatus.ACTIVE, name: 'The Coffee House' }),
      requestMemberRemoval: jest.fn(),
      cancelMemberRemoval: jest.fn(),
    };
    platformSettingsDbService = { get: jest.fn() };
    billingEntitlementsService = { canInviteTeamMember: jest.fn().mockResolvedValue(true) };
    queueManager = { addMemberInviteEmailJob: jest.fn().mockResolvedValue(undefined) };
    configService = {
      get: jest.fn((key: string) => {
        return key === 'FRONTEND_URL' ? 'https://app.innopeak.test' : undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantMembersService,
        { provide: AuthDbService, useValue: authDbService },
        { provide: PlatformSettingsDbService, useValue: platformSettingsDbService },
        { provide: BillingEntitlementsService, useValue: billingEntitlementsService },
        { provide: AddingJobsToQueueManager, useValue: queueManager },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(TenantMembersService);
    platformSettingsDbService.get.mockResolvedValue({ inviteMembersEnabled: true });
  });

  afterEach(() => jest.clearAllMocks());

  describe('listMembers', () => {
    it("lists every member for the caller's own tenant", async () => {
      authDbService.listTenantMembers.mockResolvedValue([
        {
          id: 'owner-1',
          name: 'Jane Doe',
          email: 'owner@thecoffeehouse.com',
          role: UserRole.OWNER,
          status: UserStatus.ACTIVE,
          invitedAt: '2026-01-01T00:00:00Z',
        },
      ]);

      const result = await target.listMembers(owner);

      expect(authDbService.listTenantMembers).toHaveBeenCalledWith('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: 'owner-1', role: UserRole.OWNER });
    });
  });

  describe('sendInvite', () => {
    it('refuses to invite while invite_members_enabled is off', async () => {
      platformSettingsDbService.get.mockResolvedValue({ inviteMembersEnabled: false });

      await expect(
        target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' })
      ).rejects.toThrow(ForbiddenException);
      expect(authDbService.createMemberInvite).not.toHaveBeenCalled();
    });

    it('refuses to invite when the plan has reached its team member limit, independent of the platform switch', async () => {
      billingEntitlementsService.canInviteTeamMember.mockResolvedValue(false);

      await expect(
        target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' })
      ).rejects.toThrow(TeamMemberLimitReachedException);
      expect(billingEntitlementsService.canInviteTeamMember).toHaveBeenCalledWith('tenant-1');
      expect(authDbService.createMemberInvite).not.toHaveBeenCalled();
    });

    it('rejects an email with a live pending invite', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue({
        id: 'user-2',
        tenantId: 'tenant-1',
        status: UserStatus.INVITED,
        inviteExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      await expect(
        target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' })
      ).rejects.toThrow(ConflictException);
      expect(authDbService.deleteExpiredMemberInvite).not.toHaveBeenCalled();
      expect(authDbService.createMemberInvite).not.toHaveBeenCalled();
    });

    /**
     * Regression target: an email that already belongs to a real account (this tenant's own
     * owner, a member of a different tenant, a platform admin who also self-registered) must not
     * get the same "already invited" wording a genuinely pending invite gets — that phrasing reads
     * as actionable ("wait for them to accept") when the real answer is "this address already has
     * an account and cannot be invited at all".
     */
    it('rejects an email that already belongs to a real account with the generic already-registered message', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue({
        id: 'user-2',
        tenantId: 'tenant-1',
        status: UserStatus.ACTIVE,
        inviteExpiresAt: null,
      });

      await expect(
        target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' })
      ).rejects.toThrow(ConflictException);

      try {
        await target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' });
      } catch (error) {
        expect((error as ConflictException).message).toBe(MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED);
      }
    });

    /**
     * Nothing expires or sweeps invite rows automatically, so before this an invite that was
     * never accepted claimed its address permanently — mirrors
     * `AdminSettingsService.sendInvite`'s own lapsed-invite replacement.
     */
    it('replaces a lapsed invite instead of refusing the address forever', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue({
        id: 'stale-1',
        tenantId: 'tenant-1',
        status: UserStatus.INVITED,
        inviteExpiresAt: new Date(Date.now() - 86_400_000).toISOString(),
      });
      authDbService.createMemberInvite.mockResolvedValue({
        id: 'user-3',
        name: 'sam.rivera@thecoffeehouse.com',
        email: 'sam.rivera@thecoffeehouse.com',
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00Z',
      });

      const result = await target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' });

      expect(authDbService.deleteExpiredMemberInvite).toHaveBeenCalledWith('stale-1');
      expect(authDbService.createMemberInvite).toHaveBeenCalled();
      expect(result.email).toBe('sam.rivera@thecoffeehouse.com');
    });

    /**
     * The nightly `AUTH_TOKEN_CLEANUP` sweep deletes an expired invite's token row
     * (`PURGEABLE_OTP_PURPOSES` covers `invite`) but leaves the `users` row `invited` — the same
     * shape `findMemberInviteStatusByEmail`'s left join produces for that row: `inviteExpiresAt`
     * comes back `null`, not a past date. Before this fix, `null` read as "not an invite at all"
     * (the same value a self-signed-up owner has) rather than "lapsed", so the address was stuck
     * behind a permanent 409 with no live invite anyone could revoke.
     */
    it('replaces an invite whose token row the nightly sweep already deleted (null expiry, still invited)', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue({
        id: 'swept-1',
        tenantId: 'tenant-1',
        status: UserStatus.INVITED,
        inviteExpiresAt: null,
      });
      authDbService.createMemberInvite.mockResolvedValue({
        id: 'user-4',
        name: 'sam.rivera@thecoffeehouse.com',
        email: 'sam.rivera@thecoffeehouse.com',
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00Z',
      });

      const result = await target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' });

      expect(authDbService.deleteExpiredMemberInvite).toHaveBeenCalledWith('swept-1');
      expect(authDbService.createMemberInvite).toHaveBeenCalled();
      expect(result.email).toBe('sam.rivera@thecoffeehouse.com');
    });

    /**
     * The same `null` expiry means something else entirely on a row that was never invited in the
     * first place — a self-signed-up owner has no invite token and therefore no expiry either.
     * That row must keep answering "already registered", never be deleted and replaced.
     */
    it('still refuses a self-registered account with no invite token (null expiry, active status)', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue({
        id: 'owner-2',
        tenantId: 'tenant-2',
        status: UserStatus.ACTIVE,
        inviteExpiresAt: null,
      });

      await expect(
        target.sendInvite(owner, { email: 'someone-else@example.com' })
      ).rejects.toMatchObject({ message: MESSAGES.AUTH.EMAIL_ALREADY_REGISTERED });

      expect(authDbService.deleteExpiredMemberInvite).not.toHaveBeenCalled();
      expect(authDbService.createMemberInvite).not.toHaveBeenCalled();
    });

    it('creates the invite for a genuinely new email and emails the link', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue(null);
      authDbService.createMemberInvite.mockResolvedValue({
        id: 'user-4',
        name: 'sam.rivera@thecoffeehouse.com',
        email: 'sam.rivera@thecoffeehouse.com',
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00Z',
      });

      const result = await target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' });

      expect(authDbService.createMemberInvite).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-1', invitedByUserId: 'owner-1' })
      );
      expect(result).toMatchObject({ id: 'user-4', status: UserStatus.INVITED });
      expect(queueManager.addMemberInviteEmailJob).toHaveBeenCalledWith(
        JobName.MEMBER_INVITE_EMAIL,
        expect.objectContaining({ businessName: 'The Coffee House' })
      );
    });

    /**
     * `owner.tenantId` names the tenant an authenticated owner belongs to — `findTenantStatus`
     * returning `null` for it is not expected to happen. A literal fallback, not a thrown error,
     * since a slightly generic invite email is a fine outcome for a case that should not occur,
     * and failing the whole invite over a cosmetic detail would not be.
     */
    it('falls back to a generic business name if the tenant lookup somehow comes back empty', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue(null);
      authDbService.findTenantStatus.mockResolvedValue(null);
      authDbService.createMemberInvite.mockResolvedValue({
        id: 'user-5',
        name: 'sam.rivera@thecoffeehouse.com',
        email: 'sam.rivera@thecoffeehouse.com',
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00Z',
      });

      await target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' });

      expect(queueManager.addMemberInviteEmailJob).toHaveBeenCalledWith(
        JobName.MEMBER_INVITE_EMAIL,
        expect.objectContaining({ businessName: 'your team' })
      );
    });

    /**
     * The pre-check above is read-then-write: two owners inviting the same address at once can
     * both pass it, and the second insert hits the global unique-email index. That must surface as
     * the same 409 a synchronous duplicate gets, not a raw 500.
     */
    it('maps a unique-violation race on insert to the same conflict a synchronous duplicate gets', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue(null);
      const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
      authDbService.createMemberInvite.mockRejectedValue(uniqueViolation);

      await expect(
        target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' })
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows an error that is not a unique violation', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue(null);
      authDbService.createMemberInvite.mockRejectedValue(new Error('boom'));

      await expect(
        target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' })
      ).rejects.toThrow('boom');
    });
  });

  describe('revokeInvite', () => {
    it('throws 404 for no such member in this tenant', async () => {
      authDbService.revokeMemberInvite.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.revokeInvite(owner, 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('throws 409 for a member that is no longer invited', async () => {
      authDbService.revokeMemberInvite.mockResolvedValue({ outcome: 'not_invited' });

      await expect(target.revokeInvite(owner, 'user-2')).rejects.toThrow(ConflictException);
    });

    it("revokes a live invite, scoped to the caller's own tenant", async () => {
      authDbService.revokeMemberInvite.mockResolvedValue({
        outcome: 'revoked',
        email: 'sam.rivera@thecoffeehouse.com',
      });

      await target.revokeInvite(owner, 'user-2');

      expect(authDbService.revokeMemberInvite).toHaveBeenCalledWith('tenant-1', 'user-2');
    });
  });

  describe('requestRemoval', () => {
    it('refuses self-removal before any DB round trip', async () => {
      await expect(target.requestRemoval(owner, owner.id)).rejects.toThrow(BadRequestException);
      expect(authDbService.requestMemberRemoval).not.toHaveBeenCalled();
    });

    it('throws 404 for no such member in this tenant', async () => {
      authDbService.requestMemberRemoval.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.requestRemoval(owner, 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('throws 400 when the target is the last remaining owner', async () => {
      authDbService.requestMemberRemoval.mockResolvedValue({ outcome: 'last_owner' });

      await expect(target.requestRemoval(owner, 'owner-2')).rejects.toThrow(BadRequestException);
    });

    it("requests removal, scoped to the caller's own tenant, and reports the configured grace period", async () => {
      authDbService.requestMemberRemoval.mockResolvedValue({
        outcome: 'requested',
        id: 'user-2',
        email: 'sam.rivera@thecoffeehouse.com',
      });
      configService.get.mockImplementation((key: string) => {
        return key === 'ERASURE_GRACE_PERIOD_DAYS' ? 30 : undefined;
      });

      const result = await target.requestRemoval(owner, 'user-2');

      expect(authDbService.requestMemberRemoval).toHaveBeenCalledWith('tenant-1', 'user-2');
      expect(result).toEqual({ gracePeriodDays: 30 });
    });

    it('defaults the grace period to 21 days when unset', async () => {
      authDbService.requestMemberRemoval.mockResolvedValue({
        outcome: 'requested',
        id: 'user-2',
        email: 'sam.rivera@thecoffeehouse.com',
      });

      const result = await target.requestRemoval(owner, 'user-2');

      expect(result).toEqual({ gracePeriodDays: 21 });
    });
  });

  describe('cancelRemoval', () => {
    it('throws 404 for no such member in this tenant', async () => {
      authDbService.cancelMemberRemoval.mockResolvedValue({ outcome: 'not_found' });

      await expect(target.cancelRemoval(owner, 'user-2')).rejects.toThrow(NotFoundException);
    });

    it('throws 409 when the member has no pending removal', async () => {
      authDbService.cancelMemberRemoval.mockResolvedValue({ outcome: 'not_pending' });

      await expect(target.cancelRemoval(owner, 'user-2')).rejects.toThrow(ConflictException);
    });

    it("cancels a pending removal, scoped to the caller's own tenant", async () => {
      authDbService.cancelMemberRemoval.mockResolvedValue({ outcome: 'cancelled', id: 'user-2' });

      await target.cancelRemoval(owner, 'user-2');

      expect(authDbService.cancelMemberRemoval).toHaveBeenCalledWith('tenant-1', 'user-2');
    });
  });
});
