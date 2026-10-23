import { SsoProvider } from '@auth/constants/sso-auth.constants';
import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import { PlatformActivityType } from '@common/enums/platform-activity-type.enum';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuthDbService } from './auth.db-service';
import { AuthRepository } from './auth.repository';

import { AdminOverviewDbService } from '../admin-overview/admin-overview.db-service';
import { TenantSubscriptionsDbService } from '../billing/tenant-subscriptions.db-service';
import { PromptsDbService } from '../prompts/prompts.db-service';

describe('AuthDbService', () => {
  let target: AuthDbService;
  let authRepository: jest.Mocked<AuthRepository>;
  let promptsDbService: jest.Mocked<PromptsDbService>;
  let tenantSubscriptionsDbService: jest.Mocked<TenantSubscriptionsDbService>;
  let adminOverviewDbService: { recordActivityBestEffort: jest.Mock };
  const tx = {} as never;

  beforeEach(async () => {
    authRepository = {
      findUserByEmail: jest.fn(),
      upsertUserIdentity: jest.fn(),
      findUserById: jest.fn(),
      findTenantStatusById: jest.fn(),
      hasConnectedBusiness: jest.fn(),
      insertTenant: jest.fn(),
      insertOwnerUser: jest.fn(),
      insertTenantSettings: jest.fn(),
      insertNotificationRecipient: jest.fn(),
      putVerifyEmailToken: jest.fn(),
      consumeVerifyEmailToken: jest.fn(),
      activateUser: jest.fn(),
      activateTenant: jest.fn(),
      updatePasswordHash: jest.fn(),
      insertRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
      revokeAllRefreshTokensForUser: jest.fn(),
      deleteStaleOtpTokens: jest.fn(),
      deleteStaleRefreshTokens: jest.fn(),
      deleteStalePendingSignups: jest.fn().mockResolvedValue(0),
      deleteStalePendingSignup: jest.fn(),
      insertInvitedMember: jest.fn(),
      insertMemberInviteToken: jest.fn(),
      findMemberInviteStatusByEmail: jest.fn(),
      findMemberInviteEmailByTokenHash: jest.fn(),
      acceptMemberInviteWithPassword: jest.fn(),
      acceptMemberInviteWithGoogleIdentity: jest.fn(),
      deleteInvitedMember: jest.fn(),
      deleteExpiredMemberInvite: jest.fn(),
      listTenantMembers: jest.fn(),
      requestMemberRemoval: jest.fn(),
      cancelMemberRemoval: jest.fn(),
      anonymizeUser: jest.fn(),
      transaction: jest.fn((fn: (tx: never) => unknown) => fn(tx)),
    } as unknown as jest.Mocked<AuthRepository>;

    promptsDbService = {
      insertDefaultsForTenant: jest.fn(),
    } as unknown as jest.Mocked<PromptsDbService>;

    tenantSubscriptionsDbService = {
      insertFreeSubscription: jest.fn(),
    } as unknown as jest.Mocked<TenantSubscriptionsDbService>;

    adminOverviewDbService = { recordActivityBestEffort: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthDbService,
        { provide: AuthRepository, useValue: authRepository },
        { provide: PromptsDbService, useValue: promptsDbService },
        { provide: TenantSubscriptionsDbService, useValue: tenantSubscriptionsDbService },
        { provide: AdminOverviewDbService, useValue: adminOverviewDbService },
      ],
    }).compile();

    target = module.get(AuthDbService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('signup', () => {
    const input = {
      businessName: 'The Coffee House',
      ownerName: 'Jane Doe',
      email: 'jane@thecoffeehouse.com',
      passwordHash: 'hashed',
      tokenHash: 'token-hash',
      tokenExpiresAt: new Date('2026-01-01T00:00:00Z'),
    };

    it('returns null without creating anything when the email is already registered', async () => {
      authRepository.findUserByEmail.mockResolvedValue({
        id: 'existing-user',
        tenantId: 'existing-tenant',
        name: 'Jane Doe',
        email: input.email,
        passwordHash: 'hashed',
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        locale: null,
      });

      const result = await target.signup(input);

      expect(result).toBeNull();
      expect(authRepository.insertTenant).not.toHaveBeenCalled();
      expect(authRepository.transaction).not.toHaveBeenCalled();
    });

    // An unverified sign-up only holds an address for a day: whoever started it may not own the mailbox, so a newer sign-up replaces it.
    describe('an address that has an unverified sign-up', () => {
      const pending = {
        id: 'stale-user',
        tenantId: 'stale-tenant',
        name: 'Someone',
        email: input.email,
        passwordHash: 'strangers-hash',
        role: UserRole.OWNER,
        status: UserStatus.PENDING_VERIFICATION,
        locale: null,
      };

      beforeEach(() => {
        authRepository.findUserByEmail.mockResolvedValue(pending);
        authRepository.insertTenant.mockResolvedValue({ id: 'tenant-1' });
        authRepository.insertOwnerUser.mockResolvedValue({ id: 'user-1' });
      });

      it('replaces it, in the same transaction as the new sign-up, once it is a day old', async () => {
        authRepository.deleteStalePendingSignup.mockResolvedValue(true);

        const result = await target.signup(input);

        expect(authRepository.deleteStalePendingSignup).toHaveBeenCalledWith(tx, {
          userId: 'stale-user',
          tenantId: 'stale-tenant',
          olderThanHours: 24,
        });
        expect(result).toMatchObject({ userId: 'user-1', tenantId: 'tenant-1' });
        const [removed] = authRepository.deleteStalePendingSignup.mock.invocationCallOrder;
        const [inserted] = authRepository.insertTenant.mock.invocationCallOrder;
        expect(removed).toBeLessThan(inserted as number);
      });

      it('is still held when younger than that: answers as already registered and creates nothing', async () => {
        authRepository.deleteStalePendingSignup.mockResolvedValue(false);

        await expect(target.signup(input)).resolves.toBeNull();

        expect(authRepository.insertTenant).not.toHaveBeenCalled();
        expect(authRepository.insertOwnerUser).not.toHaveBeenCalled();
      });
    });

    it.each([UserStatus.ACTIVE, UserStatus.DISABLED, UserStatus.INVITED])(
      'never replaces an address held by a %s account',
      async status => {
        authRepository.findUserByEmail.mockResolvedValue({
          id: 'existing-user',
          tenantId: 'existing-tenant',
          name: 'Jane Doe',
          email: input.email,
          passwordHash: 'hashed',
          role: UserRole.OWNER,
          status,
          locale: null,
        });

        await expect(target.signup(input)).resolves.toBeNull();

        expect(authRepository.deleteStalePendingSignup).not.toHaveBeenCalled();
        expect(authRepository.transaction).not.toHaveBeenCalled();
      }
    );

    it('creates a tenant, owner, settings, and the verify_email token for a genuinely new email', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);
      authRepository.insertTenant.mockResolvedValue({ id: 'tenant-1' });
      authRepository.insertOwnerUser.mockResolvedValue({ id: 'user-1' });

      const result = await target.signup(input);

      expect(result).toEqual({
        tenantId: 'tenant-1',
        userId: 'user-1',
        status: UserStatus.PENDING_VERIFICATION,
        ownerName: 'Jane Doe',
      });
      expect(authRepository.insertTenant).toHaveBeenCalledWith(tx, { name: input.businessName });
      expect(authRepository.insertOwnerUser).toHaveBeenCalledWith(tx, {
        tenantId: 'tenant-1',
        name: input.ownerName,
        email: input.email,
        passwordHash: input.passwordHash,
      });
      expect(authRepository.insertTenantSettings).toHaveBeenCalledWith(tx, {
        tenantId: 'tenant-1',
      });
      expect(tenantSubscriptionsDbService.insertFreeSubscription).toHaveBeenCalledWith(
        tx,
        'tenant-1'
      );
      expect(authRepository.insertNotificationRecipient).toHaveBeenCalledWith(tx, {
        tenantId: 'tenant-1',
        userId: 'user-1',
      });
      expect(authRepository.putVerifyEmailToken).toHaveBeenCalledWith(tx, {
        userId: 'user-1',
        tokenHash: input.tokenHash,
        expiresAt: input.tokenExpiresAt.toISOString(),
      });
      // Provisioning waits for verification — this tenant may never activate.
      expect(promptsDbService.insertDefaultsForTenant).not.toHaveBeenCalled();
    });

    it('returns null when a concurrent signup wins the idx_users_email_active race after the pre-check passed', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);
      authRepository.insertTenant.mockResolvedValue({ id: 'tenant-1' });
      // Drizzle wraps the pg DatabaseError as `.cause`
      const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint: 'idx_users_email_active',
      });
      authRepository.insertOwnerUser.mockRejectedValue(
        Object.assign(new Error('Failed query'), { cause: pgError })
      );

      await expect(target.signup(input)).resolves.toBeNull();
    });

    it('rethrows any other unique violation rather than masking it as "already registered"', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);
      authRepository.insertTenant.mockResolvedValue({ id: 'tenant-1' });
      authRepository.insertOwnerUser.mockRejectedValue(
        Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint: 'idx_users_tenant_id_email',
        })
      );

      await expect(target.signup(input)).rejects.toThrow('duplicate key');
    });

    it('rethrows non-unique-violation failures', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);
      authRepository.insertTenant.mockRejectedValue(new Error('connection lost'));

      await expect(target.signup(input)).rejects.toThrow('connection lost');
    });
  });

  describe('linkSsoIdentityByEmail', () => {
    it('does not link or sign in a pending team invite: only the invite link may accept it', async () => {
      authRepository.findUserByEmail.mockResolvedValue({
        id: 'invitee-1',
        tenantId: 'tenant-1',
        name: 'Sam',
        email: 'sam@thecoffeehouse.com',
        passwordHash: null,
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
        locale: null,
      });

      const result = await target.linkSsoIdentityByEmail({
        provider: SsoProvider.GOOGLE,
        providerUserId: 'g-sub',
        email: 'sam@thecoffeehouse.com',
      });

      expect(result).toEqual({ kind: 'invited' });
      expect(authRepository.transaction).not.toHaveBeenCalled();
      expect(authRepository.upsertUserIdentity).not.toHaveBeenCalled();
    });
  });

  describe('rotateRefreshToken', () => {
    const replacement = {
      userId: 'user-1',
      tokenHash: 'new-hash',
      expiresAt: '2026-01-08T00:00:00Z',
    };

    it('revokes the spent token and inserts the replacement in the same transaction', async () => {
      authRepository.revokeRefreshToken.mockResolvedValue(true);

      await expect(target.rotateRefreshToken('rt-1', replacement)).resolves.toBe(true);

      expect(authRepository.transaction).toHaveBeenCalledTimes(1);
      expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(tx, 'rt-1');
      expect(authRepository.insertRefreshToken).toHaveBeenCalledWith(tx, replacement);
    });

    it('inserts nothing and returns false when the token was already revoked by a concurrent rotation', async () => {
      authRepository.revokeRefreshToken.mockResolvedValue(false);

      await expect(target.rotateRefreshToken('rt-1', replacement)).resolves.toBe(false);

      expect(authRepository.insertRefreshToken).not.toHaveBeenCalled();
    });
  });

  it('purgeStaleTokens deletes the stale sets in one transaction and reports the counts', async () => {
    authRepository.deleteStaleOtpTokens.mockResolvedValue(3);
    authRepository.deleteStaleRefreshTokens.mockResolvedValue(12);
    authRepository.deleteStalePendingSignups.mockResolvedValue(2);

    await expect(target.purgeStaleTokens()).resolves.toEqual({
      otpTokens: 3,
      refreshTokens: 12,
      pendingSignups: 2,
    });
    expect(authRepository.transaction).toHaveBeenCalledTimes(1);
    expect(authRepository.deleteStaleOtpTokens).toHaveBeenCalledWith(tx);
    expect(authRepository.deleteStaleRefreshTokens).toHaveBeenCalledWith(tx);
    // A sign-up nobody verified within a week.
    expect(authRepository.deleteStalePendingSignups).toHaveBeenCalledWith(tx, 24 * 7);
  });

  describe('verifyEmail', () => {
    const user = {
      id: 'user-1',
      tenantId: 'tenant-1',
      name: 'Jane Doe',
      email: 'jane@thecoffeehouse.com',
      passwordHash: 'hashed',
      role: UserRole.OWNER,
      status: UserStatus.PENDING_VERIFICATION,
      locale: null,
    };

    it('returns null when no user exists at that email', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);

      const result = await target.verifyEmail({
        email: 'jane@thecoffeehouse.com',
        tokenHash: 'code-hash',
      });

      expect(result).toBeNull();
      expect(authRepository.transaction).not.toHaveBeenCalled();
    });

    it('returns null when the account is not pending_verification', async () => {
      authRepository.findUserByEmail.mockResolvedValue({ ...user, status: UserStatus.ACTIVE });

      const result = await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(result).toBeNull();
      expect(authRepository.transaction).not.toHaveBeenCalled();
    });

    it('returns null when the code fails to consume', async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(false);

      const result = await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(result).toBeNull();
      expect(authRepository.activateUser).not.toHaveBeenCalled();
      expect(promptsDbService.insertDefaultsForTenant).not.toHaveBeenCalled();
    });

    it("provisions the tenant's default prompts in the same transaction as activation", async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(true);
      authRepository.activateUser.mockResolvedValue(true);

      await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(promptsDbService.insertDefaultsForTenant).toHaveBeenCalledWith(tx, user.tenantId);
      expect(authRepository.transaction).toHaveBeenCalledTimes(1);
    });

    it("moves the owner's tenant off pending_activation in that same transaction", async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(true);
      authRepository.activateUser.mockResolvedValue(true);

      await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(authRepository.activateTenant).toHaveBeenCalledWith(tx, user.tenantId);
    });

    it('does not provision when the activation guard blocks it', async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(true);
      authRepository.activateUser.mockResolvedValue(false);

      await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(promptsDbService.insertDefaultsForTenant).not.toHaveBeenCalled();
    });

    it('returns null when the code consumes but activation guard blocks it', async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(true);
      authRepository.activateUser.mockResolvedValue(false);

      const result = await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(result).toBeNull();
    });

    it('returns the verified user on success', async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(true);
      authRepository.activateUser.mockResolvedValue(true);

      const result = await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(result).toEqual({
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash: user.passwordHash,
        status: UserStatus.ACTIVE,
        locale: user.locale,
      });
      expect(authRepository.consumeVerifyEmailToken).toHaveBeenCalledWith(tx, {
        userId: user.id,
        tokenHash: 'code-hash',
      });
      expect(authRepository.activateUser).toHaveBeenCalledWith(tx, user.id);
    });

    // A new business joining is what the platform activity feed shows: the owner is the actor, and it is written once the signup is real.
    it('records that a new business joined, after the activation committed', async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(true);
      authRepository.activateUser.mockResolvedValue(true);
      authRepository.findTenantStatusById.mockResolvedValue({
        status: 'active',
        name: 'The Coffee House',
      } as never);

      await target.verifyEmail({ email: user.email, tokenHash: 'code-hash' });

      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.BUSINESS_JOINED,
        actorPlatformAdminId: null,
        actorEmail: user.email,
        tenantId: user.tenantId,
        businessName: 'The Coffee House',
      });
    });

    it('records nothing when the code is wrong, so nothing joined', async () => {
      authRepository.findUserByEmail.mockResolvedValue(user);
      authRepository.consumeVerifyEmailToken.mockResolvedValue(false);

      await target.verifyEmail({ email: user.email, tokenHash: 'bad' });

      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });
  });

  describe('completeSsoSignup', () => {
    it('records that a new business joined, named as the owner typed it', async () => {
      authRepository.findUserByEmail.mockResolvedValue(null);
      authRepository.insertTenant.mockResolvedValue({ id: 'tenant-9' });
      authRepository.insertVerifiedOwnerUser = jest.fn().mockResolvedValue({ id: 'user-9' });
      authRepository.upsertUserIdentity.mockResolvedValue(undefined);
      authRepository.activateTenant.mockResolvedValue(undefined);

      await target.completeSsoSignup({
        provider: SsoProvider.GOOGLE,
        providerUserId: 'g-sub',
        email: 'owner@thecoffeehouse.com',
        name: 'Owner',
        businessName: 'The Coffee House',
      });

      expect(adminOverviewDbService.recordActivityBestEffort).toHaveBeenCalledWith({
        type: PlatformActivityType.BUSINESS_JOINED,
        actorPlatformAdminId: null,
        actorEmail: 'owner@thecoffeehouse.com',
        tenantId: 'tenant-9',
        businessName: 'The Coffee House',
      });
    });

    it('records nothing when the email was registered in the meantime', async () => {
      const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
        constraint: 'idx_users_email_active',
      });
      authRepository.transaction.mockRejectedValueOnce(
        Object.assign(new Error('Failed query'), { cause: pgError })
      );

      const result = await target.completeSsoSignup({
        provider: SsoProvider.GOOGLE,
        providerUserId: 'g-sub',
        email: 'owner@thecoffeehouse.com',
        name: null,
        businessName: 'The Coffee House',
      });

      expect(result).toBeNull();
      expect(adminOverviewDbService.recordActivityBestEffort).not.toHaveBeenCalled();
    });
  });

  it('putVerifyEmailToken wraps the repository call in a transaction', async () => {
    await target.putVerifyEmailToken({
      userId: 'user-1',
      tokenHash: 'hash',
      expiresAt: '2026-01-01T00:00:00Z',
    });

    expect(authRepository.putVerifyEmailToken).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      tokenHash: 'hash',
      expiresAt: '2026-01-01T00:00:00Z',
    });
  });

  it('hasConnectedBusiness passes through to the repository', async () => {
    authRepository.hasConnectedBusiness.mockResolvedValue(true);

    await expect(target.hasConnectedBusiness('tenant-1')).resolves.toBe(true);
    expect(authRepository.hasConnectedBusiness).toHaveBeenCalledWith('tenant-1');
  });

  it('updatePasswordAndRevokeSessions writes the hash and revokes sessions in one transaction', async () => {
    await target.updatePasswordAndRevokeSessions({ userId: 'user-1', passwordHash: 'new-hash' });

    expect(authRepository.updatePasswordHash).toHaveBeenCalledWith(tx, {
      userId: 'user-1',
      passwordHash: 'new-hash',
    });
    expect(authRepository.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(tx, 'user-1');
  });

  describe('createMemberInvite', () => {
    it('inserts the invited member and its token in one transaction, and constructs the roster row from the inputs', async () => {
      authRepository.insertInvitedMember.mockResolvedValue({ id: 'user-1' });

      const result = await target.createMemberInvite({
        tenantId: 'tenant-1',
        invitedByUserId: 'owner-1',
        email: 'sam.rivera@thecoffeehouse.com',
        tokenHash: 'hash',
        expiresAt: '2026-01-08T00:00:00Z',
      });

      expect(authRepository.insertInvitedMember).toHaveBeenCalledWith(tx, {
        tenantId: 'tenant-1',
        email: 'sam.rivera@thecoffeehouse.com',
        name: 'sam.rivera@thecoffeehouse.com',
        invitedByUserId: 'owner-1',
      });
      expect(authRepository.insertMemberInviteToken).toHaveBeenCalledWith(tx, {
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: '2026-01-08T00:00:00Z',
      });
      expect(result).toMatchObject({
        id: 'user-1',
        name: 'sam.rivera@thecoffeehouse.com',
        email: 'sam.rivera@thecoffeehouse.com',
        role: UserRole.MEMBER,
        status: UserStatus.INVITED,
      });
    });
  });

  it('findMemberInviteStatusByEmail passes through to the repository', async () => {
    authRepository.findMemberInviteStatusByEmail.mockResolvedValue(null);

    await expect(
      target.findMemberInviteStatusByEmail('sam.rivera@thecoffeehouse.com')
    ).resolves.toBeNull();
    expect(authRepository.findMemberInviteStatusByEmail).toHaveBeenCalledWith(
      'sam.rivera@thecoffeehouse.com'
    );
  });

  it('deleteExpiredMemberInvite passes through to the repository', async () => {
    await target.deleteExpiredMemberInvite('user-1');
    expect(authRepository.deleteExpiredMemberInvite).toHaveBeenCalledWith('user-1');
  });

  it('revokeMemberInvite passes through to the repository, tenant-scoped', async () => {
    authRepository.deleteInvitedMember.mockResolvedValue({
      outcome: 'revoked',
      email: 'sam.rivera@thecoffeehouse.com',
    });

    await target.revokeMemberInvite('tenant-1', 'user-1');
    expect(authRepository.deleteInvitedMember).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('listTenantMembers passes through to the repository', async () => {
    authRepository.listTenantMembers.mockResolvedValue([]);

    await expect(target.listTenantMembers('tenant-1')).resolves.toEqual([]);
    expect(authRepository.listTenantMembers).toHaveBeenCalledWith('tenant-1');
  });

  it('requestMemberRemoval passes through to the repository, tenant-scoped', async () => {
    authRepository.requestMemberRemoval.mockResolvedValue({
      outcome: 'requested',
      id: 'user-1',
      email: 'sam.rivera@thecoffeehouse.com',
    });

    await expect(target.requestMemberRemoval('tenant-1', 'user-1')).resolves.toEqual({
      outcome: 'requested',
      id: 'user-1',
      email: 'sam.rivera@thecoffeehouse.com',
    });
    expect(authRepository.requestMemberRemoval).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('cancelMemberRemoval passes through to the repository, tenant-scoped', async () => {
    authRepository.cancelMemberRemoval.mockResolvedValue({ outcome: 'cancelled', id: 'user-1' });

    await expect(target.cancelMemberRemoval('tenant-1', 'user-1')).resolves.toEqual({
      outcome: 'cancelled',
      id: 'user-1',
    });
    expect(authRepository.cancelMemberRemoval).toHaveBeenCalledWith('tenant-1', 'user-1');
  });

  it('anonymizeUser passes through to the repository', async () => {
    authRepository.anonymizeUser.mockResolvedValue({ outcome: 'anonymized' });

    await expect(target.anonymizeUser('user-1')).resolves.toEqual({ outcome: 'anonymized' });
    expect(authRepository.anonymizeUser).toHaveBeenCalledWith('user-1');
  });

  it('findMemberInviteEmailByTokenHash passes through to the repository', async () => {
    authRepository.findMemberInviteEmailByTokenHash.mockResolvedValue({
      email: 'sam.rivera@thecoffeehouse.com',
      tenantId: 'tenant-1',
    });

    await expect(target.findMemberInviteEmailByTokenHash('hash')).resolves.toEqual({
      email: 'sam.rivera@thecoffeehouse.com',
      tenantId: 'tenant-1',
    });
    expect(authRepository.findMemberInviteEmailByTokenHash).toHaveBeenCalledWith('hash');
  });

  it('acceptMemberInviteWithPassword passes through to the repository', async () => {
    authRepository.acceptMemberInviteWithPassword.mockResolvedValue({ outcome: 'invalid' });

    await expect(
      target.acceptMemberInviteWithPassword({
        tokenHash: 'hash',
        name: 'Sam Rivera',
        passwordHash: 'new-hash',
      })
    ).resolves.toEqual({ outcome: 'invalid' });
  });

  it('acceptMemberInviteWithGoogleIdentity passes through to the repository', async () => {
    authRepository.acceptMemberInviteWithGoogleIdentity.mockResolvedValue({ outcome: 'invalid' });

    await expect(
      target.acceptMemberInviteWithGoogleIdentity({
        tokenHash: 'hash',
        providerUserId: 'google-sub-1',
        email: 'sam.rivera@thecoffeehouse.com',
        name: 'Sam Rivera',
      })
    ).resolves.toEqual({ outcome: 'invalid' });
  });
});
