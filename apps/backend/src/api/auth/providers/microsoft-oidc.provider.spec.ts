import type { EnvConfig } from '@config/env.config';
import type { ConfigService } from '@nestjs/config';

import { createSign, generateKeyPairSync, type KeyObject } from 'crypto';

import { MicrosoftOidcProvider } from './microsoft-oidc.provider';

const CLIENT_ID = 'ms-client-id';
const TID = '3f2b8c1e-5a47-4d90-8e6b-0c1d2e3f4a5b';

function config(values: Record<string, string>): ConfigService<EnvConfig> {
  return {
    get: (key: string): string | undefined => values[key],
  } as unknown as ConfigService<EnvConfig>;
}

const baseConfig = {
  MICROSOFT_CLIENT_ID: CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: 'secret-value',
  MICROSOFT_CALLBACK_URL: 'https://app.test/v1/auth/microsoft/callback',
};

describe('MicrosoftOidcProvider', () => {
  const originalFetch = global.fetch;
  let privateKey: KeyObject;
  let jwk: Record<string, unknown>;

  beforeAll(() => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    privateKey = pair.privateKey;
    jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function idToken(claims: Record<string, unknown>): string {
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const full = {
      iss: `https://login.microsoftonline.com/${TID}/v2.0`,
      aud: CLIENT_ID,
      sub: 'ms-sub-1',
      tid: TID,
      nonce: 'n-1',
      exp: Math.floor(Date.now() / 1000) + 600,
      ...claims,
    };
    const input = `${encode({ alg: 'RS256', kid: 'k1' })}.${encode(full)}`;
    return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
  }

  /** Answers the token endpoint with `body`, and the JWKS endpoint with the test key. */
  function mockMicrosoft(tokenBody: unknown, tokenStatus = 200): jest.Mock {
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url.endsWith('/discovery/v2.0/keys')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ keys: [jwk] }),
        });
      }
      return Promise.resolve({
        ok: tokenStatus >= 200 && tokenStatus < 300,
        status: tokenStatus,
        json: () => Promise.resolve(tokenBody),
      });
    });
    global.fetch = fetchMock;
    return fetchMock;
  }

  const context = { codeVerifier: 'verifier-1', nonce: 'n-1' };

  it('is unconfigured until the id, secret and callback are all set', () => {
    expect(new MicrosoftOidcProvider(config({})).isConfigured()).toBe(false);
    expect(new MicrosoftOidcProvider(config({ MICROSOFT_CLIENT_ID: 'x' })).isConfigured()).toBe(
      false
    );
    expect(new MicrosoftOidcProvider(config(baseConfig)).isConfigured()).toBe(true);
  });

  it('builds an authorize URL for the common authority with nonce and an S256 challenge', () => {
    const url = new URL(
      new MicrosoftOidcProvider(config(baseConfig)).buildAuthorizationUrl({
        state: 'st',
        nonce: 'n-1',
        codeChallenge: 'chal',
      })
    );

    expect(`${url.origin}${url.pathname}`).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: 'openid email profile',
      state: 'st',
      nonce: 'n-1',
      code_challenge: 'chal',
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    // Sign-in only: nothing that would hand us a Graph or refresh token.
    expect(url.searchParams.get('scope')).not.toContain('offline_access');
  });

  it('exchanges the code with the secret and PKCE verifier, and reads a domain-verified identity', async () => {
    const fetchMock = mockMicrosoft({
      id_token: idToken({ email: 'Jane@Acme.test', name: 'Jane Doe', xms_edov: true }),
    });

    const identity = await new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity(
      'code-1',
      context
    );

    expect(identity).toEqual({
      providerUserId: 'ms-sub-1',
      email: 'Jane@Acme.test',
      emailVerified: true,
      name: 'Jane Doe',
    });
    const tokenCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/oauth2/v2.0/token')
    );
    const body = new URLSearchParams(String((tokenCall?.[1] as { body: string }).body));
    expect(Object.fromEntries(body)).toMatchObject({
      code: 'code-1',
      client_secret: 'secret-value',
      code_verifier: 'verifier-1',
      grant_type: 'authorization_code',
    });
  });

  /** The reason this provider exists in this shape: Microsoft's email claim is not proof of anything. */
  it.each([
    ['xms_edov is absent', {}],
    ['xms_edov is false', { xms_edov: false }],
  ])('marks the email unverified when %s', async (_label, extra) => {
    mockMicrosoft({ id_token: idToken({ email: 'victim@acme.test', ...extra }) });

    const identity = await new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity(
      'c',
      context
    );

    expect(identity.emailVerified).toBe(false);
    expect(identity.providerUserId).toBe('ms-sub-1');
  });

  it('accepts the numeric and string forms of xms_edov, but never trusts it without an email', async () => {
    mockMicrosoft({ id_token: idToken({ email: 'a@acme.test', xms_edov: 1 }) });
    expect(
      (await new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity('c', context))
        .emailVerified
    ).toBe(true);

    mockMicrosoft({ id_token: idToken({ xms_edov: true }) });
    const noEmail = await new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity('c', context);
    expect(noEmail).toMatchObject({ email: '', emailVerified: false });
  });

  it('keys the identity on sub, never on the mutable email or preferred_username', async () => {
    mockMicrosoft({
      id_token: idToken({
        sub: 'stable-sub',
        email: 'x@y.test',
        preferred_username: 'upn@y.test',
        xms_edov: true,
      }),
    });

    const identity = await new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity(
      'c',
      context
    );

    expect(identity.providerUserId).toBe('stable-sub');
  });

  // Regression: a stalled Microsoft token endpoint held the callback open indefinitely.
  it('bounds the token exchange with a timeout', async () => {
    const fetchMock = mockMicrosoft({
      id_token: idToken({ email: 'a@acme.test', xms_edov: true }),
    });

    await new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity('c', context);

    const tokenCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/oauth2/v2.0/token')
    );
    expect((tokenCall?.[1] as { signal?: unknown }).signal).toBeInstanceOf(AbortSignal);
  });

  it('fails without logging the response when the token endpoint refuses', async () => {
    mockMicrosoft({ error: 'invalid_grant', error_description: 'secret detail' }, 400);

    await expect(
      new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity('c', context)
    ).rejects.toThrow('Microsoft token exchange failed');
  });

  it('fails when no ID token comes back, or the token is for another client or nonce', async () => {
    mockMicrosoft({});
    await expect(
      new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity('c', context)
    ).rejects.toThrow('no ID token');

    mockMicrosoft({ id_token: idToken({ aud: 'another-app' }) });
    await expect(
      new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity('c', context)
    ).rejects.toThrow('audience');

    mockMicrosoft({ id_token: idToken({}) });
    await expect(
      new MicrosoftOidcProvider(config(baseConfig)).fetchIdentity('c', {
        ...context,
        nonce: 'other',
      })
    ).rejects.toThrow('nonce');
  });

  it('honours an overridden authority, and derives the expected issuer from it', async () => {
    const authority = 'http://localhost:4100/microsoft/common';
    const fetchMock = mockMicrosoft({
      id_token: idToken({
        iss: `http://localhost:4100/microsoft/${TID}/v2.0`,
        email: 'a@b.test',
        xms_edov: true,
      }),
    });

    const identity = await new MicrosoftOidcProvider(
      config({ ...baseConfig, MICROSOFT_AUTHORITY: authority })
    ).fetchIdentity('c', context);

    expect(identity.emailVerified).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${authority}/oauth2/v2.0/token`);
  });
});
