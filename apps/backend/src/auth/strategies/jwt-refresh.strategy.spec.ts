import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { JwtRefreshStrategy } from './jwt-refresh.strategy';

import type { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtRefreshStrategy', () => {
  let target: JwtRefreshStrategy;

  const createStrategy = async (
    getImpl: (key: string) => string | undefined
  ): Promise<JwtRefreshStrategy> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtRefreshStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockImplementation(getImpl) },
        },
      ],
    }).compile();

    return module.get(JwtRefreshStrategy);
  };

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('uses JWT_REFRESH_SECRET when it is configured', async () => {
      const getImpl = jest.fn((key: string) => {
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
        if (key === 'JWT_SECRET') return 'access-secret';
        return undefined;
      });

      target = await createStrategy(getImpl);

      expect(target).toBeDefined();
      expect(getImpl).toHaveBeenCalledWith('JWT_REFRESH_SECRET');
    });

    it('falls back to JWT_SECRET when JWT_REFRESH_SECRET is not configured', async () => {
      const getImpl = jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'access-secret';
        return undefined;
      });

      target = await createStrategy(getImpl);

      expect(target).toBeDefined();
      expect(getImpl).toHaveBeenCalledWith('JWT_REFRESH_SECRET');
      expect(getImpl).toHaveBeenCalledWith('JWT_SECRET');
    });

    it('throws when neither secret is configured, since passport-jwt rejects an empty secret', async () => {
      const getImpl = jest.fn().mockReturnValue(undefined);

      await expect(createStrategy(getImpl)).rejects.toThrow('JwtStrategy requires a secret or key');
    });
  });

  describe('validate', () => {
    beforeEach(async () => {
      target = await createStrategy(() => 'a-secret');
    });

    it('maps a valid refresh JWT payload to an AuthUser', () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['admin'],
        permissions: ['users:read', 'users:write'],
      };

      const result = target.validate(payload);

      expect(result).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        roles: ['admin'],
        permissions: ['users:read', 'users:write'],
      });
    });
  });
});
