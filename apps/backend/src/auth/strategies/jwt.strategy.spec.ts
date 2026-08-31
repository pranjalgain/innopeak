import type { EnvConfig } from '@config/env.config';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { JwtStrategy } from './jwt.strategy';

import type { JwtPayload } from '../interfaces/jwt-payload.interface';

describe('JwtStrategy', () => {
  let target: JwtStrategy;
  let configService: jest.Mocked<ConfigService<EnvConfig>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-jwt-secret') },
        },
      ],
    }).compile();

    target = module.get(JwtStrategy);
    configService = module.get(ConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('reads the JWT secret from ConfigService', () => {
      expect(configService.get).toHaveBeenCalledWith('JWT_SECRET');
    });
  });

  describe('validate', () => {
    it('maps a valid JWT payload to an AuthUser', () => {
      const payload: JwtPayload = {
        sub: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        permissions: ['users:read'],
      };

      const result = target.validate(payload);

      expect(result).toEqual({
        id: 'user-1',
        email: 'user@example.com',
        roles: ['user'],
        permissions: ['users:read'],
      });
    });

    it('maps a payload with empty roles/permissions', () => {
      const payload: JwtPayload = {
        sub: 'user-2',
        email: 'other@example.com',
        roles: [],
        permissions: [],
      };

      const result = target.validate(payload);

      expect(result).toEqual({
        id: 'user-2',
        email: 'other@example.com',
        roles: [],
        permissions: [],
      });
    });
  });
});
