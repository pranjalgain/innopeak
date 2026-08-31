import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { PermissionsGuard } from './permissions.guard';

import type { AuthUser } from '../interfaces/auth-user.interface';

describe('PermissionsGuard', () => {
  let target: PermissionsGuard;
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
      providers: [
        PermissionsGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
    }).compile();

    target = module.get(PermissionsGuard);
    reflector = module.get(Reflector);
  });

  afterEach(() => jest.clearAllMocks());

  describe('canActivate', () => {
    it('allows access when no permissions are required on the route', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      const result = target.canActivate(buildContext(undefined));

      expect(result).toBe(true);
    });

    it('allows access when required permissions array is empty', () => {
      reflector.getAllAndOverride.mockReturnValue([]);

      const result = target.canActivate(buildContext(undefined));

      expect(result).toBe(true);
    });

    it('denies access when permissions are required but there is no user on the request', () => {
      reflector.getAllAndOverride.mockReturnValue(['users:read']);

      const result = target.canActivate(buildContext(undefined));

      expect(result).toBe(false);
    });

    it('denies access when the user has no permissions', () => {
      reflector.getAllAndOverride.mockReturnValue(['users:read']);
      const user: AuthUser = { id: '1', email: 'a@b.com', roles: [], permissions: [] };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(false);
    });

    it('allows access when the user has all of the required permissions (AND logic)', () => {
      reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:write']);
      const user: AuthUser = {
        id: '1',
        email: 'a@b.com',
        roles: [],
        permissions: ['users:read', 'users:write', 'users:delete'],
      };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(true);
    });

    it('denies access when the user is missing at least one required permission', () => {
      reflector.getAllAndOverride.mockReturnValue(['users:read', 'users:write']);
      const user: AuthUser = {
        id: '1',
        email: 'a@b.com',
        roles: [],
        permissions: ['users:read'],
      };

      const result = target.canActivate(buildContext(user));

      expect(result).toBe(false);
    });
  });
});
