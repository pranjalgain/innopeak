import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Profile, VerifyCallback } from 'passport-google-oauth20';

import { GoogleOAuthStrategy } from './google-oauth.strategy';

describe('GoogleOAuthStrategy', () => {
  let target: GoogleOAuthStrategy;

  const createStrategy = async (
    getImpl: (key: string) => string | undefined
  ): Promise<GoogleOAuthStrategy> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoogleOAuthStrategy,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockImplementation(getImpl) },
        },
      ],
    }).compile();

    return module.get(GoogleOAuthStrategy);
  };

  afterEach(() => jest.clearAllMocks());

  describe('constructor', () => {
    it('constructs successfully when credentials are configured', async () => {
      target = await createStrategy((key: string) => {
        const values: Record<string, string> = {
          GOOGLE_CLIENT_ID: 'client-id',
          GOOGLE_CLIENT_SECRET: 'client-secret',
          GOOGLE_CALLBACK_URL: 'http://localhost:3000/v1/auth/google/callback',
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

    it('maps a complete Google profile to a GoogleOAuthUser and calls done with no error', () => {
      const profile = {
        id: 'google-123',
        emails: [{ value: 'user@example.com' }],
        name: { givenName: 'Ada', familyName: 'Lovelace' },
      } as unknown as Profile;
      const done: VerifyCallback = jest.fn();

      target.validate('access-token', 'refresh-token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        provider: 'google',
        providerId: 'google-123',
        email: 'user@example.com',
        firstName: 'Ada',
        lastName: 'Lovelace',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('falls back to empty strings when the profile is missing email or name fields', () => {
      const profile = { id: 'google-456' } as unknown as Profile;
      const done: VerifyCallback = jest.fn();

      target.validate('access-token', 'refresh-token', profile, done);

      expect(done).toHaveBeenCalledWith(null, {
        provider: 'google',
        providerId: 'google-456',
        email: '',
        firstName: '',
        lastName: '',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });
  });
});
