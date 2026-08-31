import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ApiKeyGuard } from './api-key.guard';

import type { AuthUser } from '../interfaces/auth-user.interface';
import { ApiKeyService } from '../services/api-key.service';

describe('ApiKeyGuard', () => {
  let target: ApiKeyGuard;
  let reflector: jest.Mocked<Reflector>;
  let apiKeyService: jest.Mocked<ApiKeyService>;

  const buildContext = (headers: Record<string, string | undefined>, request?: object) => {
    const req: Record<string, unknown> = { headers, ...request };
    return {
      context: {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
      } as unknown as ExecutionContext,
      request: req,
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: ApiKeyService, useValue: { validateApiKey: jest.fn() } },
      ],
    }).compile();

    target = module.get(ApiKeyGuard);
    reflector = module.get(Reflector);
    apiKeyService = module.get(ApiKeyService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('canActivate', () => {
    it('allows access without checking headers when the route does not require an API key', async () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const { context } = buildContext({});

      const result = await target.canActivate(context);

      expect(result).toBe(true);
      expect(apiKeyService.validateApiKey).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when the x-api-key header is missing', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const { context } = buildContext({});

      await expect(target.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when the API key is invalid', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      apiKeyService.validateApiKey.mockResolvedValue(null);
      const { context } = buildContext({ 'x-api-key': 'bad-key' });

      await expect(target.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(apiKeyService.validateApiKey).toHaveBeenCalledWith('bad-key');
    });

    it('attaches the resolved user to the request and allows access for a valid key', async () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const authUser: AuthUser = {
        id: '1',
        email: 'a@b.com',
        roles: ['user'],
        permissions: ['users:read'],
      };
      apiKeyService.validateApiKey.mockResolvedValue(authUser);
      const { context, request } = buildContext({ 'x-api-key': 'good-key' });

      const result = await target.canActivate(context);

      expect(result).toBe(true);
      expect((request as { user?: AuthUser }).user).toEqual(authUser);
    });
  });
});
