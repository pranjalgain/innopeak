import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { RolesGuard } from './roles.guard';

import type { AuthUser } from '../interfaces/auth-user.interface';

describe('RolesGuard', () => {
  let target: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  const buildContext = (user: AuthUser | undefined): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } }],
    }).compile();

    target = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  afterEach(() => jest.clearAllMocks());

  describe('canActivate', () => {
    it('allows access when no roles are required on the route', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const result = target.canActivate(buildContext(undefined));

      expect(result).toBe(true);
    });

    it('allows access when required roles array is empty', () => {
      reflector.getAllAndOverride.mockReturnValue([]);

      const result = target.canActivate(buildContext(undefined));

      expect(result).toBe(true);
    });

    it('denies access when roles are required but there is no user on the request', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin']);

      const result = target.canActivate(buildContext(undefined));

      expect(result).toBe(false);
    });

    it('denies access when the user has no roles', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin']);
      const user: AuthUser = { id: '1', email: 'a@b.com', roles: [], permissions: [] };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(false);
    });

    it('allows access when the user has at least one of the required roles (OR logic)', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin', 'moderator']);
      const user: AuthUser = { id: '1', email: 'a@b.com', roles: ['moderator'], permissions: [] };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(true);
    });

    it('denies access when the user has none of the required roles', () => {
      reflector.getAllAndOverride.mockReturnValue(['admin', 'moderator']);
      const user: AuthUser = { id: '1', email: 'a@b.com', roles: ['user'], permissions: [] };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(false);
    });
  });
});
