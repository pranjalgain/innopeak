import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { GoogleOAuthStateService } from './google-oauth-state.service';

import { OAuthIntent } from '../enums/oauth-intent.enum';

/**
 * The three layers are the whole point of this class, so each is tested by defeating it: a forged
 * signature, a replayed nonce, and a callback arriving from a different browser.
 */
describe('GoogleOAuthStateService', () => {
  let target: GoogleOAuthStateService;
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
        GoogleOAuthStateService,
        { provide: ConfigService, useValue: { get: (): string => 'test-secret' } },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    target = module.get(GoogleOAuthStateService);
  });

  it('round-trips the record the write path depends on', async () => {
    const { state, sid } = await target.mint({ intent: OAuthIntent.SIGNUP });

    const result = await target.consume(state, sid);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.intent).toBe(OAuthIntent.SIGNUP);
    }
  });

  /**
   * At 192 bits of randomness this never happens in practice, but a silent overwrite-miss here
   * would still hand the caller a signed state whose Redis record belongs to someone else's
   * in-flight consent — surfacing later as a generic, indistinguishable INVALID_STATE with no
   * diagnostic trail. `mint` must fail loudly instead.
   */
  it('throws rather than silently minting a state whose record write lost the NX race', async () => {
    redis.set.mockResolvedValueOnce(null);

    await expect(target.mint({ intent: OAuthIntent.LOGIN })).rejects.toThrow('nonce collision');
  });

  it('rejects a replay — the second callback finds no nonce', async () => {
    const { state, sid } = await target.mint({ intent: OAuthIntent.LOGIN });

    await expect(target.consume(state, sid)).resolves.toMatchObject({ ok: true });
    await expect(target.consume(state, sid)).resolves.toEqual({ ok: false });
  });

  it('rejects a callback from a different browser, which is the mailed-link attack', async () => {
    const { state } = await target.mint({ intent: OAuthIntent.LOGIN });

    await expect(target.consume(state, 'some-other-browsers-sid')).resolves.toEqual({ ok: false });
  });

  it('rejects a missing binding cookie', async () => {
    const { state } = await target.mint({ intent: OAuthIntent.LOGIN });

    await expect(target.consume(state, undefined)).resolves.toEqual({ ok: false });
  });

  it('rejects a forged signature without touching Redis', async () => {
    const { sid } = await target.mint({ intent: OAuthIntent.LOGIN });

    await expect(target.consume('nonce.1700000000000.forged', sid)).resolves.toEqual({
      ok: false,
    });
  });

  it('rejects a malformed blob', async () => {
    await expect(target.consume('not-a-state', 'sid')).resolves.toEqual({ ok: false });
    await expect(target.consume(undefined, 'sid')).resolves.toEqual({ ok: false });
  });

  it('does not consume the nonce when the browser check fails, so a replay stays blocked', async () => {
    const { state, sid } = await target.mint({ intent: OAuthIntent.LOGIN });

    // Wrong browser first — this still spends the nonce, by design: an attacker who guesses a
    // state should not be able to probe repeatedly, and the legitimate browser can restart.
    await expect(target.consume(state, 'wrong')).resolves.toEqual({ ok: false });
    await expect(target.consume(state, sid)).resolves.toEqual({ ok: false });
  });
});
