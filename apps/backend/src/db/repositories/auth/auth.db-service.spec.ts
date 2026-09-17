import { UserRole } from '@auth/enums/user-role.enum';
import { UserStatus } from '@auth/enums/user-status.enum';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AuthDbService } from './auth.db-service';
import { AuthRepository } from './auth.repository';

import { PromptsDbService } from '../prompts/prompts.db-service';

describe('AuthDbService', () => {
  let target: AuthDbService;
  let authRepository: jest.Mocked<AuthRepository>;
  let promptsDbService: jest.Mocked<PromptsDbService>;
  const tx = {} as never;

  beforeEach(async () => {
    authRepository = {
      findUserByEmail: jest.fn(),
      findUserById: jest.fn(),
      findTenantStatusById: jest.fn(),
      hasConnectedBusiness: jest.fn(),
      insertTenant: jest.fn(),
      insertOwnerUser: jest.fn(),
      insertTenantSettings: jest.fn(),
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
      transaction: jest.fn((fn: (tx: never) => unknown) => fn(tx)),
    } as unknown as jest.Mocked<AuthRepository>;

    promptsDbService = {
      insertDefaultsForTenant: jest.fn(),
    } as unknown as jest.Mocked<PromptsDbService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthDbService,
        { provide: AuthRepository, useValue: authRepository },
        { provide: PromptsDbService, useValue: promptsDbService },
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

  it('purgeStaleTokens deletes both stale sets in one transaction and reports the counts', async () => {
    authRepository.deleteStaleOtpTokens.mockResolvedValue(3);
    authRepository.deleteStaleRefreshTokens.mockResolvedValue(12);

    await expect(target.purgeStaleTokens()).resolves.toEqual({
      otpTokens: 3,
      refreshTokens: 12,
    });
    expect(authRepository.transaction).toHaveBeenCalledTimes(1);
    expect(authRepository.deleteStaleOtpTokens).toHaveBeenCalledWith(tx);
    expect(authRepository.deleteStaleRefreshTokens).toHaveBeenCalledWith(tx);
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
});
