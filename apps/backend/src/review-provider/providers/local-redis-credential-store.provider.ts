import { Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'crypto';

import { CredentialStoreProvider, type StoredCredential } from './credential-store.provider';

const SCHEME = 'local-redis';
const KEY_PREFIX = 'review-credentials:';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Local/dev only (the factory refuses it in production): AES-256-GCM at rest only guards against a
 * casual `KEYS *`, a copied RDB or a pasted dump, since the key sits in the same `.env`.
 * Redis because it is the only durable store the API and worker processes share.
 * A `FLUSHALL` voids every credential: `get()` returns null and the connection flips to `needs_reauth`, with a warning so it isn't mistaken for an OAuth bug.
 */
export class LocalRedisCredentialStoreProvider extends CredentialStoreProvider {
  readonly scheme = SCHEME;
  private readonly logger = new Logger(LocalRedisCredentialStoreProvider.name);
  private readonly key: Buffer;

  constructor(
    private readonly redis: Redis,
    encryptionKeyBase64: string
  ) {
    super();
    const key = Buffer.from(encryptionKeyBase64, 'base64');

    // At construction, not first use: a wrong-length key should fail at boot, not mid-OAuth.
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`
      );
    }

    this.key = key;
  }

  async put(credential: StoredCredential): Promise<string> {
    const id = randomUUID();
    await this.redis.set(`${KEY_PREFIX}${id}`, this.encrypt(JSON.stringify(credential)));
    return `${SCHEME}:${id}`;
  }

  async update(reference: string, credential: StoredCredential): Promise<void> {
    const id = this.parseReference(reference);
    await this.redis.set(`${KEY_PREFIX}${id}`, this.encrypt(JSON.stringify(credential)));
  }

  async get(reference: string): Promise<StoredCredential | null> {
    const id = this.parseReference(reference);
    const payload = await this.redis.get(`${KEY_PREFIX}${id}`);

    if (!payload) {
      this.logger.warn(
        `Credential ${reference} is not in Redis. If Redis was flushed or restarted without persistence this is expected — the connection will report needs_reauth and the owner must reconnect.`
      );
      return null;
    }

    try {
      return JSON.parse(this.decrypt(payload)) as StoredCredential;
    } catch (error) {
      // Key rotation makes existing ciphertext undecryptable; own message so it isn't mistaken for a flush.
      this.logger.error(
        `Failed to decrypt credential ${reference} — CREDENTIAL_ENCRYPTION_KEY may have changed: ${(error as Error).message}`
      );
      return null;
    }
  }

  async delete(reference: string): Promise<void> {
    await this.redis.del(`${KEY_PREFIX}${this.parseReference(reference)}`);
  }

  /** Rejects a foreign reference rather than returning null, which would be indistinguishable from a revoked grant. */
  private parseReference(reference: string): string {
    const [scheme, ...rest] = reference.split(':');

    if (scheme !== SCHEME || rest.length === 0) {
      throw new Error(
        `Credential reference "${reference}" was not issued by the ${SCHEME} store. This node cannot resolve it.`
      );
    }

    return rest.join(':');
  }

  /** `iv:authTag:ciphertext`, all base64. */
  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }

  private decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(':');

    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error('Malformed encrypted credential payload');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
