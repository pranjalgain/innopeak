import { createHash, createPublicKey, createVerify } from 'crypto';

import { describe, expect, it } from 'vitest';

import request from 'supertest';

import { createApp } from '../app';

const REDIRECT = 'http://localhost:3002/v1/auth/microsoft/callback';
const verifier = 'a-long-random-code-verifier-value';
const challenge = createHash('sha256').update(verifier).digest('base64url');

const claimsOf = (idToken: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(idToken.split('.')[1] as string, 'base64url').toString()) as Record<string, unknown>;

async function authorize(
  app: ReturnType<typeof createApp>,
  overrides: Record<string, string> = {}
): Promise<string> {
  const response = await request(app)
    .post('/microsoft/common/oauth2/v2.0/authorize')
    .type('form')
    .send({
      client_id: 'client-1',
      redirect_uri: REDIRECT,
      state: 'state-1',
      nonce: 'nonce-1',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      email: 'jane@acme.test',
      name: 'Jane',
      domain_verified: 'on',
      ...overrides,
    });
  expect(response.status).toBe(302);
  return String(new URL(response.header['location'] as string).searchParams.get('code'));
}

const exchange = (
  app: ReturnType<typeof createApp>,
  code: string,
  overrides: Record<string, string> = {}
) =>
  request(app)
    .post('/microsoft/common/oauth2/v2.0/token')
    .type('form')
    .send({
      grant_type: 'authorization_code',
      client_id: 'client-1',
      client_secret: 'secret',
      redirect_uri: REDIRECT,
      code,
      code_verifier: verifier,
      ...overrides,
    });

describe('mock Microsoft authority', () => {
  it('returns to the redirect URI with a code and the same state', async () => {
    const response = await request(createApp())
      .post('/microsoft/common/oauth2/v2.0/authorize')
      .type('form')
      .send({ client_id: 'c', redirect_uri: REDIRECT, state: 'abc', email: 'a@b.test' });

    const location = new URL(response.header['location'] as string);
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('abc');
    expect(location.searchParams.get('code')).toBeTruthy();
  });

  it('returns an access_denied error when cancelled', async () => {
    const response = await request(createApp())
      .post('/microsoft/common/oauth2/v2.0/authorize')
      .type('form')
      .send({ redirect_uri: REDIRECT, state: 'abc', deny: '1' });

    expect(new URL(response.header['location'] as string).searchParams.get('error')).toBe('access_denied');
  });

  it('issues an RS256 ID token whose signature verifies against the published JWKS', async () => {
    const app = createApp();
    const token = await exchange(app, await authorize(app));
    const idToken = token.body.id_token as string;
    const [h, p, s] = idToken.split('.') as [string, string, string];

    const keys = await request(app).get('/microsoft/common/discovery/v2.0/keys');
    const key = createPublicKey({ key: keys.body.keys[0], format: 'jwk' });
    const valid = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s, 'base64url'));

    expect(valid).toBe(true);
    expect(claimsOf(idToken)).toMatchObject({
      aud: 'client-1',
      nonce: 'nonce-1',
      email: 'jane@acme.test',
      xms_edov: true,
      ver: '2.0',
    });
  });

  it('omits xms_edov unless the email domain is marked verified', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/microsoft/common/oauth2/v2.0/authorize')
      .type('form')
      .send({ client_id: 'client-1', redirect_uri: REDIRECT, state: 's', nonce: 'n', email: 'x@y.test' });
    const code = String(new URL(response.header['location'] as string).searchParams.get('code'));

    const token = await exchange(app, code, { code_verifier: '' });

    expect(claimsOf(token.body.id_token as string)['xms_edov']).toBeUndefined();
  });

  it('uses the personal-account tenant for outlook.com and the tenant in the issuer', async () => {
    const app = createApp();
    const token = await exchange(app, await authorize(app, { email: 'dev@outlook.com' }));
    const claims = claimsOf(token.body.id_token as string);

    expect(claims['tid']).toBe('9188040d-6c67-4c5b-b112-36a304b66dad');
    expect(String(claims['iss'])).toMatch(/\/microsoft\/9188040d-6c67-4c5b-b112-36a304b66dad\/v2\.0$/);
  });

  it('gives the same email the same sub every time', async () => {
    const app = createApp();
    const a = claimsOf((await exchange(app, await authorize(app))).body.id_token as string);
    const b = claimsOf((await exchange(app, await authorize(app))).body.id_token as string);

    expect(a['sub']).toBe(b['sub']);
  });

  it('redeems a code only once', async () => {
    const app = createApp();
    const code = await authorize(app);

    expect((await exchange(app, code)).status).toBe(200);
    const replay = await exchange(app, code);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe('invalid_grant');
  });

  it('enforces PKCE and the redirect URI', async () => {
    const app = createApp();

    const wrongVerifier = await exchange(app, await authorize(app), { code_verifier: 'not-the-verifier' });
    expect(wrongVerifier.body).toMatchObject({ error: 'invalid_grant' });

    const wrongRedirect = await exchange(app, await authorize(app), { redirect_uri: 'http://evil.test/cb' });
    expect(wrongRedirect.body).toMatchObject({ error: 'invalid_grant' });
  });

  it('requires a client secret and the authorization_code grant', async () => {
    const app = createApp();

    expect((await exchange(app, await authorize(app), { client_secret: '' })).body.error).toBe('invalid_client');
    expect((await exchange(app, await authorize(app), { grant_type: 'password' })).body.error).toBe(
      'unsupported_grant_type'
    );
  });

  it('escapes the values it echoes into the sign-in page', async () => {
    const response = await request(createApp())
      .get('/microsoft/common/oauth2/v2.0/authorize')
      .query({ state: '"><script>alert(1)</script>' });

    expect(response.text).not.toContain('<script>alert(1)</script>');
  });
});
