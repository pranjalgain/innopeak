import { JwtTokenType } from '@auth/enums/jwt-token-type.enum';
import { TenantStatus } from '@auth/enums/tenant-status.enum';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { TokenService } from '@auth/services/token.service';
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
  let tokenService: { revokeAll: jest.Mock };
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
    tokenService = { revokeAll: jest.fn().mockResolvedValue(undefined) };
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
        { provide: TokenService, useValue: tokenService },
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

    // Regression: an email owned by a real account must not get the actionable "already invited" wording of a pending invite.
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

    // Regression: an unaccepted invite used to claim its address permanently.
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

    // Regression: the nightly cleanup deletes an expired invite's token but leaves the user `invited`,
    // so `inviteExpiresAt` is null; that must read as lapsed, not a live invite (permanent 409).
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

    // A null expiry on a never-invited row (self-signed-up owner) must keep answering "already registered", not be replaced.
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

    it('takes the invite back and answers 503 when the email queue refuses it', async () => {
      authDbService.findMemberInviteStatusByEmail.mockResolvedValue(null);
      authDbService.createMemberInvite.mockResolvedValue({
        id: 'user-4',
        name: 'sam.rivera@thecoffeehouse.com',
        email: 'sam.rivera@thecoffeehouse.com',
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
        invitedAt: '2026-03-01T00:00:00Z',
      });
      authDbService.revokeMemberInvite.mockResolvedValue({ outcome: 'revoked' });
      queueManager.addMemberInviteEmailJob.mockRejectedValue(new Error('redis down'));

      await expect(
        target.sendInvite(owner, { email: 'sam.rivera@thecoffeehouse.com' })
      ).rejects.toMatchObject({ response: { code: 'EMAIL_QUEUE_UNAVAILABLE' } });

      expect(authDbService.revokeMemberInvite).toHaveBeenCalledWith('tenant-1', 'user-4');
    });

    // A missing tenant row sends the invite unnamed (the email then says "a team", in the inviter's language) rather than failing it.
    it('sends the invite without a business name if the tenant lookup somehow comes back empty', async () => {
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

      const [, job] = queueManager.addMemberInviteEmailJob.mock.calls.at(-1) ?? [];
      expect(job).not.toHaveProperty('businessName');
      expect(job).toMatchObject({ locale: 'en' });
    });

    // The pre-check is read-then-write: a concurrent duplicate hits the unique-email index and must still be a 409, not a 500.
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

    // Access is disabled by the request, so the member's access tokens end now rather than when they lapse.
    it("ends the removed member's access tokens, and nobody else's, when removal is requested", async () => {
      authDbService.requestMemberRemoval.mockResolvedValue({
        outcome: 'requested',
        id: 'user-2',
        email: 'sam.rivera@thecoffeehouse.com',
      });

      await target.requestRemoval(owner, 'user-2');

      expect(tokenService.revokeAll).toHaveBeenCalledTimes(1);
      expect(tokenService.revokeAll).toHaveBeenCalledWith('user-2');
    });

    it('ends no sessions when the removal was refused', async () => {
      authDbService.requestMemberRemoval.mockResolvedValueOnce({ outcome: 'not_found' });
      await expect(target.requestRemoval(owner, 'user-2')).rejects.toThrow(NotFoundException);

      authDbService.requestMemberRemoval.mockResolvedValueOnce({ outcome: 'last_owner' });
      await expect(target.requestRemoval(owner, 'owner-2')).rejects.toThrow(BadRequestException);

      await expect(target.requestRemoval(owner, owner.id)).rejects.toThrow(BadRequestException);

      expect(tokenService.revokeAll).not.toHaveBeenCalled();
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
