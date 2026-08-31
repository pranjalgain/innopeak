import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Profile } from 'passport-github2';

import type { GithubOAuthUser } from './github-oauth.strategy';
import { GithubOAuthStrategy } from './github-oauth.strategy';

describe('GithubOAuthStrategy', () => {
  let target: GithubOAuthStrategy;

  const createStrategy = async (
    getImpl: (key: string) => string | undefined
  ): Promise<GithubOAuthStrategy> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GithubOAuthStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockImplementation(getImpl) },
        },
      ],
    }).compile();

    return module.get(GithubOAuthStrategy);
  };

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('constructs successfully when credentials are configured', async () => {
      target = await createStrategy((key: string) => {
        const values: Record<string, string> = {
          GITHUB_CLIENT_ID: 'client-id',
          GITHUB_CLIENT_SECRET: 'client-secret',
          GITHUB_CALLBACK_URL: 'http://localhost:3000/v1/auth/github/callback',
        };
        return values[key];
      });

      expect(target).toBeDefined();
    });

    it('constructs successfully with disabled placeholder credentials when not configured', async () => {
      target = await createStrategy(() => undefined);

      expect(target).toBeDefined();
    });
  });

  describe('validate', () => {
    beforeEach(async () => {
      target = await createStrategy(() => undefined);
    });

    it('maps a complete GitHub profile to a GithubOAuthUser and calls done with no error', () => {
      const profile = {
        id: 'github-123',
        emails: [{ value: 'user@example.com' }],
        displayName: 'Ada Lovelace',
      } as unknown as Profile;
      const done = jest.fn<void, [Error | null, GithubOAuthUser?]>();

      target.validate('access-token', 'refresh-token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        provider: 'github',
        providerId: 'github-123',
        email: 'user@example.com',
        displayName: 'Ada Lovelace',
        accessToken: 'access-token',
      });
    });

    it('falls back to an empty email string when the profile has no emails', () => {
      const profile = {
        id: 'github-456',
        displayName: 'No Email User',
      } as unknown as Profile;
      const done = jest.fn<void, [Error | null, GithubOAuthUser?]>();

      target.validate('access-token', 'refresh-token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        provider: 'github',
        providerId: 'github-456',
        email: '',
        displayName: 'No Email User',
        accessToken: 'access-token',
      });
    });
  });
});
