import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { MfaGuard } from './mfa.guard';

import type { AuthUser } from '../interfaces/auth-user.interface';

interface MfaAwareUser extends AuthUser {
  mfaEnabled?: boolean;
  mfaVerified?: boolean;
}

describe('MfaGuard', () => {
  let target: MfaGuard;

  const buildContext = (user: MfaAwareUser | undefined): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MfaGuard],
    }).compile();

    target = module.get(MfaGuard);
  });

  afterEach(() => jest.clearAllMocks());

  describe('canActivate', () => {
    it('allows access when there is no user on the request', () => {
      const result = target.canActivate(buildContext(undefined));

      expect(result).toBe(true);
    });

    it('allows access when MFA is not enabled for the user', () => {
      const user: MfaAwareUser = {
        id: '1',
        email: 'a@b.com',
        roles: [],
        permissions: [],
        mfaEnabled: false,
      };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(true);
    });

    it('allows access when MFA is enabled and the session is MFA-verified', () => {
      const user: MfaAwareUser = {
        id: '1',
        email: 'a@b.com',
        roles: [],
        permissions: [],
        mfaEnabled: true,
        mfaVerified: true,
      };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(true);
    });

    it('throws ForbiddenException when MFA is enabled but not yet verified for the session', () => {
      const user: MfaAwareUser = {
        id: '1',
        email: 'a@b.com',
        roles: [],
        permissions: [],
        mfaEnabled: true,
        mfaVerified: false,
      };

      expect(() => target.canActivate(buildContext(user))).toThrow(ForbiddenException);
    });
  });
});
