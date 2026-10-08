import { createSign, generateKeyPairSync, type KeyObject } from 'crypto';

import { type IdTokenClaims, IdTokenVerifier } from './id-token-verifier';

const CLIENT_ID = 'client-id';
const TID = 'tenant-guid';
const NOW = 1_800_000_000_000;

function makeKey(kid: string): { privateKey: KeyObject; jwk: Record<string, unknown> } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' },
  };
}

function sign(
  privateKey: KeyObject,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'k1' }
): string {
  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey)
    .toString('base64url');
  return `${signingInput}.${signature}`;
}

const goodClaims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: `https://login.microsoftonline.com/${TID}/v2.0`,
  aud: CLIENT_ID,
  sub: 'user-sub',
  tid: TID,
  nonce: 'the-nonce',
  exp: NOW / 1000 + 600,
  nbf: NOW / 1000 - 5,
  ...overrides,
});

const expectations = {
  audience: CLIENT_ID,
  nonce: 'the-nonce',
  expectedIssuer: (claims: IdTokenClaims): string =>
    `https://login.microsoftonline.com/${claims.tid ?? ''}/v2.0`,
};

describe('IdTokenVerifier', () => {
  let key: ReturnType<typeof makeKey>;
  let jwks: { keys: Record<string, unknown>[] };
  let fetchImpl: jest.Mock;
  let target: IdTokenVerifier;

  beforeEach(() => {
    key = makeKey('k1');
    jwks = { keys: [key.jwk] };
    fetchImpl = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(jwks) })
      );
    target = new IdTokenVerifier('https://keys.test/jwks', fetchImpl);
  });

  it('accepts a correctly signed token and returns its claims', async () => {
    const token = sign(key.privateKey, goodClaims({ email: 'jane@acme.test' }));

    const claims = await target.verify(token, expectations, NOW);

    expect(claims).toMatchObject({ sub: 'user-sub', email: 'jane@acme.test' });
  });

  it.each([
    ['a different audience', { aud: 'someone-else' }, 'audience'],
    [
      'an issuer that does not match its own tenant',
      { iss: 'https://login.microsoftonline.com/other/v2.0' },
      'issuer',
    ],
    ['no tenant', { tid: undefined }, 'tenant'],
    ['an expired token', { exp: NOW / 1000 - 3600 }, 'expired'],
    ['a token not valid yet', { nbf: NOW / 1000 + 3600 }, 'not valid yet'],
    ['a nonce from another request', { nonce: 'replayed' }, 'nonce'],
    ['no subject', { sub: undefined }, 'subject'],
  ])('rejects %s', async (_label, overrides, message) => {
    const token = sign(key.privateKey, goodClaims(overrides));

    await expect(target.verify(token, expectations, NOW)).rejects.toThrow(message);
  });

  it('rejects a token signed by a different key', async () => {
    const attacker = makeKey('k1');
    const token = sign(attacker.privateKey, goodClaims());

    await expect(target.verify(token, expectations, NOW)).rejects.toThrow('signature is invalid');
  });

  it('rejects a tampered payload', async () => {
    const token = sign(key.privateKey, goodClaims());
    const [h, , s] = token.split('.') as [string, string, string];
    const forged = Buffer.from(JSON.stringify(goodClaims({ sub: 'someone-else' }))).toString(
      'base64url'
    );

    await expect(target.verify(`${h}.${forged}.${s}`, expectations, NOW)).rejects.toThrow(
      'signature is invalid'
    );
  });

  it('refuses any algorithm but RS256, including none and HS256', async () => {
    const header = (alg: string): string =>
      Buffer.from(JSON.stringify({ alg, kid: 'k1' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(goodClaims())).toString('base64url');

    await expect(target.verify(`${header('none')}.${body}.`, expectations, NOW)).rejects.toThrow(
      'unsupported signing algorithm'
    );
    await expect(
      target.verify(`${header('HS256')}.${body}.abc`, expectations, NOW)
    ).rejects.toThrow('unsupported signing algorithm');
  });

  it('rejects malformed tokens', async () => {
    await expect(target.verify('not-a-jwt', expectations, NOW)).rejects.toThrow('not a JWT');
    await expect(target.verify('a.b.c', expectations, NOW)).rejects.toThrow();
  });

  it('fetches the key set once and serves later tokens from cache', async () => {
    const token = sign(key.privateKey, goodClaims());

    await target.verify(token, expectations, NOW);
    await target.verify(token, expectations, NOW + 1000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refetches once for a rotated key, but not again within the cooldown', async () => {
    await target.verify(sign(key.privateKey, goodClaims()), expectations, NOW);
    const rotated = makeKey('k2');
    jwks.keys = [key.jwk, rotated.jwk];

    const token = sign(rotated.privateKey, goodClaims(), { alg: 'RS256', kid: 'k2' });
    await expect(target.verify(token, expectations, NOW + 120_000)).resolves.toMatchObject({
      sub: 'user-sub',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // An unknown kid straight afterwards must not become another request to the JWKS endpoint.
    const unknown = sign(rotated.privateKey, goodClaims(), { alg: 'RS256', kid: 'unknown' });
    await expect(target.verify(unknown, expectations, NOW + 121_000)).rejects.toThrow(
      'key is unknown'
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('fails when the JWKS endpoint does', async () => {
    fetchImpl.mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });

    await expect(
      target.verify(sign(key.privateKey, goodClaims()), expectations, NOW)
    ).rejects.toThrow('JWKS request failed with 503');
  });
});
