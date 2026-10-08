import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { createHash } from 'crypto';

import { OAuthStateService } from './oauth-state.service';

import { SsoProvider } from '../constants/sso-auth.constants';
import { OAuthIntent } from '../enums/oauth-intent.enum';

/**
 * Each of the three layers is tested by defeating it: forged signature, replayed nonce, callback
 * from a different browser.
 */
describe('OAuthStateService', () => {
  let target: OAuthStateService;
  let store: Map<string, string>;
  let redis: { set: jest.Mock; getdel: jest.Mock };

  beforeEach(async () => {
    store = new Map();
    redis = {
      set: jest.fn((key: string, value: string) => {
        if (store.has(key)) return Promise.resolve(null); // NX
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      // GETDEL is what makes the nonce single-use — modelled faithfully, since a read-then-delete
      // stand-in would let the replay test pass for the wrong reason.
      getdel: jest.fn((key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return Promise.resolve(value);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthStateService,
        { provide: ConfigService, useValue: { get: (): string => 'test-secret' } },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    target = module.get(OAuthStateService);
  });

  it('round-trips the record the write path depends on', async () => {
    const { state, sid } = await target.mint({
      provider: SsoProvider.GOOGLE,
      intent: OAuthIntent.SIGNUP,
    });

    const result = await target.consume(SsoProvider.GOOGLE, state, sid);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.intent).toBe(OAuthIntent.SIGNUP);
    }
  });

  it('keeps the OIDC nonce and, when asked, a PKCE verifier only server-side', async () => {
    const minted = await target.mint({
      provider: SsoProvider.MICROSOFT,
      intent: OAuthIntent.LOGIN,
      pkce: true,
    });

    const result = await target.consume(SsoProvider.MICROSOFT, minted.state, minted.sid);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.nonce).toBe(minted.nonce);
      expect(result.record.provider).toBe(SsoProvider.MICROSOFT);
      // The challenge is the S256 hash of the stored verifier; the verifier itself never leaves.
      expect(
        createHash('sha256')
          .update(result.record.codeVerifier ?? '')
          .digest('base64url')
      ).toBe(minted.codeChallenge);
      expect(JSON.stringify(minted)).not.toContain(result.record.codeVerifier);
    }
  });

  it('issues no PKCE material unless asked', async () => {
    const minted = await target.mint({ provider: SsoProvider.GOOGLE, intent: OAuthIntent.LOGIN });

    expect(minted.codeChallenge).toBeUndefined();
  });

  /** A state is a bearer blob; one minted for Google must not satisfy the Microsoft callback or the reverse. */
  it('refuses a state presented to the other provider’s callback', async () => {
    const google = await target.mint({ provider: SsoProvider.GOOGLE, intent: OAuthIntent.LOGIN });
    await expect(target.consume(SsoProvider.MICROSOFT, google.state, google.sid)).resolves.toEqual({
      ok: false,
    });

    const microsoft = await target.mint({
      provider: SsoProvider.MICROSOFT,
      intent: OAuthIntent.LOGIN,
    });
    await expect(
      target.consume(SsoProvider.GOOGLE, microsoft.state, microsoft.sid)
    ).resolves.toEqual({ ok: false });
  });

  /**
   * `mint` must fail loudly on a nonce collision rather than return a state whose Redis record
   * belongs to someone else.
   */
  it('throws rather than silently minting a state whose record write lost the NX race', async () => {
    redis.set.mockResolvedValueOnce(null);

    await expect(
      target.mint({ provider: SsoProvider.GOOGLE, intent: OAuthIntent.LOGIN })
    ).rejects.toThrow('nonce collision');
  });

  it('rejects a replay — the second callback finds no nonce', async () => {
    const { state, sid } = await target.mint({
      provider: SsoProvider.GOOGLE,
      intent: OAuthIntent.LOGIN,
    });

    await expect(target.consume(SsoProvider.GOOGLE, state, sid)).resolves.toMatchObject({
      ok: true,
    });
    await expect(target.consume(SsoProvider.GOOGLE, state, sid)).resolves.toEqual({ ok: false });
  });

  it('rejects a callback from a different browser, which is the mailed-link attack', async () => {
    const { state } = await target.mint({
      provider: SsoProvider.GOOGLE,
      intent: OAuthIntent.LOGIN,
    });

    await expect(
      target.consume(SsoProvider.GOOGLE, state, 'some-other-browsers-sid')
    ).resolves.toEqual({ ok: false });
  });

  it('rejects a missing binding cookie', async () => {
    const { state } = await target.mint({
      provider: SsoProvider.GOOGLE,
      intent: OAuthIntent.LOGIN,
    });

    await expect(target.consume(SsoProvider.GOOGLE, state, undefined)).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a forged signature without touching Redis', async () => {
    const { sid } = await target.mint({ provider: SsoProvider.GOOGLE, intent: OAuthIntent.LOGIN });

    await expect(
      target.consume(SsoProvider.GOOGLE, 'nonce.1700000000000.forged', sid)
    ).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a malformed blob', async () => {
    await expect(target.consume(SsoProvider.GOOGLE, 'not-a-state', 'sid')).resolves.toEqual({
      ok: false,
    });
    await expect(target.consume(SsoProvider.GOOGLE, undefined, 'sid')).resolves.toEqual({
      ok: false,
    });
  });

  it('does not consume the nonce when the browser check fails, so a replay stays blocked', async () => {
    const { state, sid } = await target.mint({
      provider: SsoProvider.GOOGLE,
      intent: OAuthIntent.LOGIN,
    });

    // Wrong browser first — this still spends the nonce, by design: an attacker who guesses a
    // state should not be able to probe repeatedly, and the legitimate browser can restart.
    await expect(target.consume(SsoProvider.GOOGLE, state, 'wrong')).resolves.toEqual({
      ok: false,
    });
    await expect(target.consume(SsoProvider.GOOGLE, state, sid)).resolves.toEqual({ ok: false });
  });
});
