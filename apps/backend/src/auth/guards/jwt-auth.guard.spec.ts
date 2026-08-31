import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let target: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;
  let superCanActivateSpy: jest.SpyInstance;

  const buildContext = (): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({}),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    // AuthGuard('jwt') is memoized by @nestjs/passport, so this prototype is the
    // same one that JwtAuthGuard extends, meaning we can safely stub Passport's
    // underlying canActivate implementation without hitting real passport-jwt logic.
    superCanActivateSpy = jest
      .spyOn(AuthGuard('jwt').prototype, 'canActivate')
      .mockImplementation(() => true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtAuthGuard, { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } }],
    }).compile();

    target = module.get(JwtAuthGuard);
    reflector = module.get(Reflector);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('canActivate', () => {
    it('bypasses authentication when the route is marked @Public()', () => {
      reflector.getAllAndOverride.mockReturnValue(true);

      const result = target.canActivate(buildContext());

      expect(result).toBe(true);
      expect(superCanActivateSpy).not.toHaveBeenCalled();
    });

    it('delegates to the Passport JWT strategy when the route is not public', () => {
      reflector.getAllAndOverride.mockReturnValue(false);

      const result = target.canActivate(buildContext());

      expect(superCanActivateSpy).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('propagates rejection from the Passport strategy for non-public routes', async () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);
      superCanActivateSpy.mockImplementation(() => Promise.reject(new Error('Unauthorized')));

      await expect(target.canActivate(buildContext())).rejects.toThrow('Unauthorized');
    });
  });
});
