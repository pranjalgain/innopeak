import { EnvConfig } from '@config/env.config';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REDIS_CLIENT } from '@redis/redis.provider';
import {
  CREDENTIAL_KEY_BYTES,
  decryptWithKey,
  encryptWithKey,
} from '@review-provider/utils/credential-crypto';
import type Redis from 'ioredis';

import { createHash } from 'crypto';

import { PENDING_ACCOUNT_CHOICE_TTL_SECONDS } from '../constants/connections.constants';
import { ReturnTo } from '../enums/return-to.enum';
import type { PendingAccountChoice } from '../types/connections.type';

const KEY_PREFIX = 'connections:pending-account:';

/** Same value `OAuthStateService` falls back to, so local development works with nothing set. */
const DEV_FALLBACK_SECRET = 'insecure-local-gbp-state-secret';

/**
 * Holds a consented Google grant while the owner chooses between several Business Profile accounts.
 *
 * The grant's tokens are the sensitive part, so the whole record is AES-256-GCM encrypted before it reaches
 * Redis, and nothing goes to the credential store until an account is chosen: an abandoned choice leaves no
 * orphaned secret, only a record that expires. One record per tenant, so a fresh consent replaces a stale one.
 *
 * The key is `CREDENTIAL_ENCRYPTION_KEY` when set (always the case locally), otherwise derived from
 * `GBP_STATE_SECRET`, which production already requires. Production keeps its long-lived tokens in Secrets
 * Manager and may legitimately have no Redis key; this record lives 15 minutes at most.
 */
@Injectable()
export class PendingAccountChoiceService {
  private readonly logger = new Logger(PendingAccountChoiceService.name);
  private readonly key: Buffer;

  constructor(
    configService: ConfigService<EnvConfig>,
    @Inject(REDIS_CLIENT) private readonly redis: Redis
  ) {
    this.key = resolveKey(
      configService.get<string>('CREDENTIAL_ENCRYPTION_KEY'),
      configService.get<string>('GBP_STATE_SECRET')
    );
  }

  async save(tenantId: string, choice: PendingAccountChoice): Promise<void> {
    await this.redis.set(
      this.redisKey(tenantId),
      encryptWithKey(this.key, JSON.stringify(serialize(choice))),
      'EX',
      PENDING_ACCOUNT_CHOICE_TTL_SECONDS
    );
  }

  /** Reads without consuming, so the picker can render and a wrong submission can be retried. */
  async peek(tenantId: string): Promise<PendingAccountChoice | null> {
    return this.parse(await this.redis.get(this.redisKey(tenantId)), tenantId);
  }

  /** `GETDEL`: single-use, with no window for two submissions to both succeed. */
  async claim(tenantId: string): Promise<PendingAccountChoice | null> {
    return this.parse(await this.redis.getdel(this.redisKey(tenantId)), tenantId);
  }

  private parse(payload: string | null, tenantId: string): PendingAccountChoice | null {
    if (payload === null) {
      return null;
    }

    try {
      return deserialize(JSON.parse(decryptWithKey(this.key, payload)) as SerializedChoice);
    } catch (error) {
      // A rotated key makes the record unreadable; treated as expired, the owner just connects again.
      this.logger.warn(
        `Pending account choice for tenant ${tenantId} could not be read: ${(error as Error).message}`
      );
      return null;
    }
  }

  private redisKey(tenantId: string): string {
    return `${KEY_PREFIX}${tenantId}`;
  }
}

function resolveKey(
  credentialKeyBase64: string | undefined,
  stateSecret: string | undefined
): Buffer {
  if (credentialKeyBase64) {
    const key = Buffer.from(credentialKeyBase64, 'base64');
    if (key.length === CREDENTIAL_KEY_BYTES) {
      return key;
    }
  }

  return createHash('sha256')
    .update(`pending-account-choice:${stateSecret ?? DEV_FALLBACK_SECRET}`)
    .digest();
}

/** `expiresAt` is a `Date`, which JSON would turn into a string the reader would then have to know to revive. */
interface SerializedChoice extends Omit<PendingAccountChoice, 'returnTo' | 'tokens'> {
  returnTo?: ReturnTo;
  tokens: Omit<PendingAccountChoice['tokens'], 'expiresAt'> & { expiresAt: string };
}

function serialize(choice: PendingAccountChoice): SerializedChoice {
  return {
    ...choice,
    tokens: { ...choice.tokens, expiresAt: choice.tokens.expiresAt.toISOString() },
  };
}

function deserialize(stored: SerializedChoice): PendingAccountChoice {
  return {
    ...stored,
    // Absent on a record written before `returnTo` existed; onboarding is where the picker always lived.
    returnTo: stored.returnTo ?? ReturnTo.ONBOARDING,
    tokens: { ...stored.tokens, expiresAt: new Date(stored.tokens.expiresAt) },
  };
}
