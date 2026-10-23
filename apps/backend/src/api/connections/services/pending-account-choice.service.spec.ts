import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { REDIS_CLIENT } from '@redis/redis.provider';

import { PendingAccountChoiceService } from './pending-account-choice.service';

import { PENDING_ACCOUNT_CHOICE_TTL_SECONDS } from '../constants/connections.constants';
import { ReturnTo } from '../enums/return-to.enum';
import type { PendingAccountChoice } from '../types/connections.type';

const choice: PendingAccountChoice = {
  userId: 'user-1',
  returnTo: ReturnTo.SETTINGS,
  accounts: [
    { externalAccountId: 'accounts/1', name: 'Jane Doe', type: 'PERSONAL' },
    { externalAccountId: 'accounts/2', name: 'Coastal Group', type: 'LOCATION_GROUP' },
  ],
  tokens: {
    accessToken: 'secret-access-token',
    refreshToken: 'secret-refresh-token',
    expiresAt: new Date('2026-01-01T01:00:00.000Z'),
    scope: 'https://www.googleapis.com/auth/business.manage',
  },
};

const KEY_A = Buffer.alloc(32, 7).toString('base64');
const KEY_B = Buffer.alloc(32, 9).toString('base64');

describe('PendingAccountChoiceService', () => {
  let store: Map<string, string>;
  let redis: { set: jest.Mock; get: jest.Mock; getdel: jest.Mock };

  beforeEach(() => {
    store = new Map();
    redis = {
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      // Modelled faithfully: a read-then-delete stand-in would let the single-use test pass for the wrong reason.
      getdel: jest.fn((key: string) => {
        const value = store.get(key) ?? null;
        store.delete(key);
        return Promise.resolve(value);
      }),
    };
  });

  async function build(
    config: Record<string, string | undefined>
  ): Promise<PendingAccountChoiceService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendingAccountChoiceService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: ConfigService, useValue: { get: (key: string) => config[key] } },
      ],
    }).compile();
    return module.get(PendingAccountChoiceService);
  }

  // The fallback key is derived from a string that is public in this repository.
  describe('without any key material', () => {
    const original = process.env['NODE_ENV'];
    afterEach(() => {
      process.env['NODE_ENV'] = original;
    });

    it('refuses to start in production', async () => {
      process.env['NODE_ENV'] = 'production';

      await expect(build({})).rejects.toThrow('GBP_STATE_SECRET must be set');
    });

    // A staging box runs as `development` too, and the fallback is a value public in this repository.
    it('refuses to start on a reachable staging box that runs as development', async () => {
      process.env['NODE_ENV'] = 'development';
      const frontendUrl = process.env['FRONTEND_URL'];
      process.env['FRONTEND_URL'] = 'https://staging.innopeak.example';

      try {
        await expect(build({})).rejects.toThrow('GBP_STATE_SECRET must be set');
      } finally {
        if (frontendUrl === undefined) delete process.env['FRONTEND_URL'];
        else process.env['FRONTEND_URL'] = frontendUrl;
      }
    });

    it('still works locally, where nothing is set', async () => {
      process.env['NODE_ENV'] = 'development';
      const target = await build({});

      await target.save('tenant-1', choice);

      await expect(target.peek('tenant-1')).resolves.toEqual(choice);
    });

    it('uses the state secret in production when it is set', async () => {
      process.env['NODE_ENV'] = 'production';

      await expect(build({ GBP_STATE_SECRET: 'a-real-secret-0123456789' })).resolves.toBeDefined();
    });
  });

  it('round-trips the accounts and the grant, reviving the expiry as a Date', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });

    await target.save('tenant-1', choice);

    await expect(target.peek('tenant-1')).resolves.toEqual(choice);
  });

  it('reads a record written before returnTo existed as an onboarding flow', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });
    const { returnTo: _returnTo, ...older } = choice;

    await target.save('tenant-1', older as PendingAccountChoice);

    await expect(target.peek('tenant-1')).resolves.toEqual({
      ...choice,
      returnTo: ReturnTo.ONBOARDING,
    });
  });

  it('never writes the tokens to Redis in the clear', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });

    await target.save('tenant-1', choice);

    const written = [...store.values()].join('');
    expect(written).not.toContain('secret-refresh-token');
    expect(written).not.toContain('secret-access-token');
    expect(written).not.toContain('Coastal Group');
  });

  it('expires the record after 15 minutes, one record per tenant', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });

    await target.save('tenant-1', choice);

    expect(redis.set).toHaveBeenCalledWith(
      'connections:pending-account:tenant-1',
      expect.any(String),
      'EX',
      PENDING_ACCOUNT_CHOICE_TTL_SECONDS
    );
  });

  it('lets the picker read the choice without using it up', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });
    await target.save('tenant-1', choice);

    await target.peek('tenant-1');

    await expect(target.peek('tenant-1')).resolves.not.toBeNull();
  });

  it('hands the choice out once: a second claim finds nothing', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });
    await target.save('tenant-1', choice);

    await expect(target.claim('tenant-1')).resolves.toEqual(choice);
    await expect(target.claim('tenant-1')).resolves.toBeNull();
    await expect(target.peek('tenant-1')).resolves.toBeNull();
  });

  it('finds nothing for a tenant with no pending choice', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });

    await expect(target.peek('tenant-1')).resolves.toBeNull();
    await expect(target.claim('tenant-1')).resolves.toBeNull();
  });

  it('keeps tenants apart', async () => {
    const target = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });
    await target.save('tenant-1', choice);

    await expect(target.peek('tenant-2')).resolves.toBeNull();
  });

  it('treats a record it cannot decrypt as expired, as after a key change', async () => {
    const writer = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_A });
    await writer.save('tenant-1', choice);

    const reader = await build({ CREDENTIAL_ENCRYPTION_KEY: KEY_B });

    await expect(reader.peek('tenant-1')).resolves.toBeNull();
  });

  describe('without CREDENTIAL_ENCRYPTION_KEY, as in production', () => {
    it('derives the key from GBP_STATE_SECRET, so the same secret reads what it wrote', async () => {
      const writer = await build({ GBP_STATE_SECRET: 'state-secret-one' });
      await writer.save('tenant-1', choice);

      const sameSecret = await build({ GBP_STATE_SECRET: 'state-secret-one' });
      await expect(sameSecret.peek('tenant-1')).resolves.toEqual(choice);

      const otherSecret = await build({ GBP_STATE_SECRET: 'state-secret-two' });
      await expect(otherSecret.peek('tenant-1')).resolves.toBeNull();
    });

    it('also derives a key from a malformed CREDENTIAL_ENCRYPTION_KEY instead of failing', async () => {
      const target = await build({
        CREDENTIAL_ENCRYPTION_KEY: 'too-short',
        GBP_STATE_SECRET: 'state-secret-one',
      });
      await target.save('tenant-1', choice);

      await expect(target.peek('tenant-1')).resolves.toEqual(choice);
    });
  });
});
