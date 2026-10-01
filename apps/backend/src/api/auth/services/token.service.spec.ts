import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { TokenService } from './token.service';

import { ACCESS_TOKEN_TTL_SECONDS } from '../constants/auth.constants';
import { JwtTokenType } from '../enums/jwt-token-type.enum';
import { TenantStatus } from '../enums/tenant-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { UserStatus } from '../enums/user-status.enum';
import { RefreshTokenSupersededException } from '../errors/refresh-token.error';

describe('TokenService', () => {
  let target: TokenService;
  let jwtService: jest.Mocked<JwtService>;
  let authDbService: jest.Mocked<AuthDbService>;

  const user = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'jane@thecoffeehouse.com',
    name: 'Jane Doe',
    role: UserRole.OWNER,
    passwordHash: 'hashed',
    status: UserStatus.ACTIVE,
    locale: null,
  };

  const validRefreshClaims = { sub: user.id, jti: 'jti-1', type: JwtTokenType.REFRESH };

  beforeEach(async () => {
    jwtService = {
      sign: jest.fn(() => 'signed-token'),
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    authDbService = {
      insertRefreshToken: jest.fn(),
      findRefreshTokenByHash: jest.fn(),
      findUserById: jest.fn(),
      findTenantStatus: jest.fn(),
      rotateRefreshToken: jest.fn().mockResolvedValue(true),
      hasActiveRefreshToken: jest.fn().mockResolvedValue(false),
      revokeAllRefreshTokensForUser: jest.fn(),
    } as unknown as jest.Mocked<AuthDbService>;

    const configService = { get: jest.fn(() => 'refresh-secret') } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: jwtService },
        { provide: AuthDbService, useValue: authDbService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    target = module.get(TokenService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('issueTokenPair', () => {
    it('signs an access token and a distinct refresh token, and persists the refresh token hash', async () => {
      jwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');

      const result = await target.issueTokenPair({
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        locale: user.locale,
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(authDbService.insertRefreshToken).toHaveBeenCalledWith({
        userId: user.id,
        tokenHash: expect.any(String),
        expiresAt: expect.any(String),
      });
      // never persists the raw refresh token itself
      expect(authDbService.insertRefreshToken).not.toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: 'refresh-token' })
      );
    });

    it('reports the ACCESS token lifetime as expiresIn, not the refresh token lifetime', async () => {
      const result = await target.issueTokenPair(user);

      expect(result.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    });

    it('stamps the access token as tenant_user and the refresh token as refresh', async () => {
      await target.issueTokenPair(user);

      expect(jwtService.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ sub: user.id, type: JwtTokenType.TENANT_USER })
      );
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          sub: user.id,
          type: JwtTokenType.REFRESH,
          jti: expect.any(String),
        }),
        expect.objectContaining({ secret: 'refresh-secret' })
      );
    });
  });

  describe('signPlatformAdminAccessToken', () => {
    it('signs a payload JwtStrategy will accept as a platform admin — no refresh token, no DB write', () => {
      jwtService.sign.mockReturnValueOnce('admin-access-token');

      const result = target.signPlatformAdminAccessToken({
        id: 'admin-1',
        email: 'admin@innopeak.com',
        locale: null,
      });

      expect(result).toEqual({
        accessToken: 'admin-access-token',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      });
      expect(jwtService.sign).toHaveBeenCalledTimes(1);
      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: 'admin-1',
          email: 'admin@innopeak.com',
          locale: null,
          type: JwtTokenType.PLATFORM_ADMIN,
        },
        { expiresIn: ACCESS_TOKEN_TTL_SECONDS }
      );
      expect(authDbService.insertRefreshToken).not.toHaveBeenCalled();
    });

    it("carries the admin's locale onto the signed payload", () => {
      jwtService.sign.mockReturnValueOnce('admin-access-token');

      target.signPlatformAdminAccessToken({
        id: 'admin-1',
        email: 'admin@innopeak.com',
        locale: 'de',
      });

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'de' }),
        expect.anything()
      );
    });

    // The security property behind `remainingSessionSeconds`: a mid-session claim refresh must
    // not hand back a longer-lived token than the one that authorized it, or the route doing the
    // refreshing becomes a way to keep an un-renewable admin session alive forever.
    it('honours an explicit remaining lifetime instead of granting a fresh TTL', () => {
      jwtService.sign.mockReturnValueOnce('admin-access-token');

      const result = target.signPlatformAdminAccessToken(
        { id: 'admin-1', email: 'admin@innopeak.com', locale: 'de' },
        42
      );

      expect(result).toEqual({ accessToken: 'admin-access-token', expiresIn: 42 });
      expect(jwtService.sign).toHaveBeenCalledWith(expect.anything(), { expiresIn: 42 });
    });
  });

  describe('rotate', () => {
    it('rejects a token that fails JWT verification', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('bad signature');
      });

      await expect(target.rotate('garbage')).rejects.toThrow(UnauthorizedException);
      expect(authDbService.findRefreshTokenByHash).not.toHaveBeenCalled();
    });

    it('rejects a JWT that verifies but is not typed as a refresh token (e.g. an access token under a shared secret)', async () => {
      jwtService.verify.mockReturnValue({
        sub: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        type: JwtTokenType.TENANT_USER,
      });

      await expect(target.rotate('access-token-as-refresh')).rejects.toThrow(UnauthorizedException);
      expect(authDbService.findRefreshTokenByHash).not.toHaveBeenCalled();
    });

    it('rejects a JWT with no type claim at all', async () => {
      jwtService.verify.mockReturnValue({ sub: user.id, jti: 'jti-1' });

      await expect(target.rotate('legacy-token')).rejects.toThrow(UnauthorizedException);
      expect(authDbService.findRefreshTokenByHash).not.toHaveBeenCalled();
    });

    it('rejects when no active refresh_tokens row matches', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue(null);

      await expect(target.rotate('some-token')).rejects.toThrow(UnauthorizedException);
    });

    /**
     * The distinction the cookie layer depends on. Same 401 either way, but only a dead family
     * may clear the browser's session cookies — clearing on a lost rotation race would discard
     * the valid successor the winning request just issued. See `AuthController.refresh`.
     */
    it('reports a dead family (no live session left) as a plain UnauthorizedException', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue(null);
      authDbService.hasActiveRefreshToken.mockResolvedValue(false);

      await expect(target.rotate('revoked-or-db-reset-token')).rejects.not.toBeInstanceOf(
        RefreshTokenSupersededException
      );
      await expect(target.rotate('revoked-or-db-reset-token')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('reports a token superseded by a concurrent refresh as RefreshTokenSupersededException', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      // Not active any more, but the user still holds a live token — the winner's successor.
      authDbService.findRefreshTokenByHash.mockResolvedValue(null);
      authDbService.hasActiveRefreshToken.mockResolvedValue(true);

      await expect(target.rotate('lost-the-race-token')).rejects.toBeInstanceOf(
        RefreshTokenSupersededException
      );
      expect(authDbService.hasActiveRefreshToken).toHaveBeenCalledWith(validRefreshClaims.sub);
    });

    /**
     * Reuse detection. The row is still present but already revoked, and how long ago decides
     * whether this is a benign two-tab race or a replay of a token that leaked.
     */
    it('treats a token spent moments ago as a lost race, keeping the session alive', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: new Date().toISOString(),
      });

      await expect(target.rotate('some-token')).rejects.toBeInstanceOf(
        RefreshTokenSupersededException
      );
      // Load-bearing: revoking here would sign the winner out of every tab.
      expect(authDbService.revokeAllRefreshTokensForUser).not.toHaveBeenCalled();
    });

    it('treats a token spent long ago as reuse, revoking every session for that user', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: new Date(Date.now() - 60_000).toISOString(),
      });

      // Not the superseded subclass: this one MUST clear the caller's cookies.
      const rejection = target.rotate('some-token');
      await expect(rejection).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(rejection).rejects.not.toBeInstanceOf(RefreshTokenSupersededException);
      expect(authDbService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(user.id);
      // The thief gets nothing: no replacement is minted on the way out.
      expect(authDbService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('reports a lost compare-and-swap as superseded, without asking whether a session survives', async () => {
      // The row was active when read and gone by the CAS: definitionally someone else spent it,
      // so their successor is live and no `hasActiveRefreshToken` round trip is needed.
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: null,
      });
      authDbService.findUserById.mockResolvedValue(user);
      authDbService.findTenantStatus.mockResolvedValue({ status: 'active' } as never);
      authDbService.rotateRefreshToken.mockResolvedValue(false);

      await expect(target.rotate('some-token')).rejects.toBeInstanceOf(
        RefreshTokenSupersededException
      );
    });

    it('rejects when the stored token belongs to a different user than the JWT claims', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: 'someone-else',
        revokedAt: null,
      });

      await expect(target.rotate('some-token')).rejects.toThrow(UnauthorizedException);
    });

    it('revokes every refresh token and rejects when the user is disabled', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: null,
      });
      authDbService.findUserById.mockResolvedValue({ ...user, status: UserStatus.DISABLED });
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });

      await expect(target.rotate('some-token')).rejects.toThrow(UnauthorizedException);
      expect(authDbService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(user.id);
      expect(authDbService.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('revokes every refresh token and rejects when the tenant is suspended', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: null,
      });
      authDbService.findUserById.mockResolvedValue(user);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.SUSPENDED,
        name: 'Test Tenant',
      });

      await expect(target.rotate('some-token')).rejects.toThrow(UnauthorizedException);
      expect(authDbService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(user.id);
    });

    /** Defense-in-depth: an already-issued refresh token must be explicitly rejected once every
     *  user in a tenant has been anonymized, not merely rely on each individual user's own row. */
    it('revokes every refresh token and rejects when the tenant is erased', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: null,
      });
      authDbService.findUserById.mockResolvedValue(user);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ERASED,
        name: 'Test Tenant',
      });

      await expect(target.rotate('some-token')).rejects.toThrow(UnauthorizedException);
      expect(authDbService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(user.id);
    });

    it('revokes the used token and persists the replacement in one step, then returns the fresh pair', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: null,
      });
      authDbService.findUserById.mockResolvedValue(user);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });
      jwtService.sign.mockReturnValueOnce('new-access').mockReturnValueOnce('new-refresh');

      const result = await target.rotate('some-token');

      expect(authDbService.rotateRefreshToken).toHaveBeenCalledWith('rt-1', {
        userId: user.id,
        tokenHash: expect.any(String),
        expiresAt: expect.any(String),
      });
      // the replacement is stored hashed, never raw
      expect(authDbService.rotateRefreshToken).not.toHaveBeenCalledWith(
        'rt-1',
        expect.objectContaining({ tokenHash: 'new-refresh' })
      );
      expect(authDbService.insertRefreshToken).not.toHaveBeenCalled();
      expect(result.tokens.accessToken).toBe('new-access');
      expect(result.tokens.refreshToken).toBe('new-refresh');
      expect(result.tokens.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
      expect(result.user).toEqual({
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        name: user.name,
        passwordHash: user.passwordHash,
        locale: user.locale,
      });
    });

    it('rejects (and issues nothing) when a concurrent rotation already spent the token', async () => {
      jwtService.verify.mockReturnValue(validRefreshClaims);
      authDbService.findRefreshTokenByHash.mockResolvedValue({
        id: 'rt-1',
        userId: user.id,
        revokedAt: null,
      });
      authDbService.findUserById.mockResolvedValue(user);
      authDbService.findTenantStatus.mockResolvedValue({
        status: TenantStatus.ACTIVE,
        name: 'Test Tenant',
      });
      authDbService.rotateRefreshToken.mockResolvedValue(false);

      await expect(target.rotate('some-token')).rejects.toThrow(UnauthorizedException);
      expect(authDbService.insertRefreshToken).not.toHaveBeenCalled();
    });
  });

  it('revokeAll delegates to the DB service', async () => {
    await target.revokeAll(user.id);

    expect(authDbService.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(user.id);
  });
});
