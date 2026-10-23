import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

import { GoogleOidcProvider } from './google-oidc.provider';

const config = (values: Record<string, string>): ConfigService<EnvConfig> =>
  ({
    get: (key: string): string | undefined => values[key],
  }) as unknown as ConfigService<EnvConfig>;

const baseConfig = {
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  GOOGLE_CALLBACK_URL: 'https://app.test/v1/auth/google/callback',
};

describe('GoogleOidcProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  /** Answers the token endpoint, then the userinfo endpoint; returns the mock so the request bodies can be inspected. */
  function mockGoogle(): jest.Mock {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'at' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            sub: 'g-sub-1',
            email: 'jane@acme.test',
            email_verified: true,
            name: 'Jane',
          }),
      });
    global.fetch = fetchMock;
    return fetchMock;
  }

  describe('buildAuthorizationUrl', () => {
    it('adds an S256 PKCE challenge when given one', () => {
      const url = new URL(
        new GoogleOidcProvider(config(baseConfig)).buildAuthorizationUrl({
          state: 'st',
          codeChallenge: 'chal',
        })
      );

      expect(Object.fromEntries(url.searchParams)).toMatchObject({
        state: 'st',
        code_challenge: 'chal',
        code_challenge_method: 'S256',
        client_id: 'google-client-id',
      });
    });

    it('sends no challenge when there is none, rather than an empty one', () => {
      const url = new URL(
        new GoogleOidcProvider(config(baseConfig)).buildAuthorizationUrl({ state: 'st' })
      );

      expect(url.searchParams.has('code_challenge')).toBe(false);
      expect(url.searchParams.has('code_challenge_method')).toBe(false);
    });
  });

  describe('fetchIdentity', () => {
    const tokenBody = (fetchMock: jest.Mock): Record<string, string> => {
      const init = fetchMock.mock.calls[0]?.[1] as { body: string };
      return Object.fromEntries(new URLSearchParams(init.body));
    };

    it('redeems the code with the PKCE verifier when there is one, and reads the identity', async () => {
      const fetchMock = mockGoogle();

      const identity = await new GoogleOidcProvider(config(baseConfig)).fetchIdentity('code-1', {
        codeVerifier: 'verifier-1',
      });

      expect(tokenBody(fetchMock)).toMatchObject({
        code: 'code-1',
        code_verifier: 'verifier-1',
        grant_type: 'authorization_code',
      });
      expect(identity).toEqual({
        providerUserId: 'g-sub-1',
        email: 'jane@acme.test',
        emailVerified: true,
        name: 'Jane',
      });
    });

    // A state minted before PKCE shipped had no challenge, so Google would reject a verifier it was never given.
    it('sends no verifier for a round trip that had no challenge', async () => {
      const fetchMock = mockGoogle();

      await new GoogleOidcProvider(config(baseConfig)).fetchIdentity('code-1');

      expect(tokenBody(fetchMock)).not.toHaveProperty('code_verifier');
    });
  });
});
