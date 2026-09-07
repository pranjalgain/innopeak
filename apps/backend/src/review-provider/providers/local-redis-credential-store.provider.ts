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
 * Local/dev credential store: Redis, with AES-256-GCM at rest.
 *
 * **What this defends against, stated plainly:** a casual `KEYS *` in a shared dev Redis, a copied
 * RDB file, a Redis dump pasted into a bug report. It is *not* a KMS trust boundary — the key
 * lives in the same `.env` as everything else, so anyone with the env has the plaintext. That is
 * an acceptable local posture and an unacceptable production one, which is why the factory refuses
 * to construct this class in production regardless of deployment target.
 *
 * Redis rather than Postgres because it is the only durable store both the API and worker
 * processes already share, and the worker needs to resolve credentials to run a backfill.
 *
 * **Known failure mode:** a `FLUSHALL` voids every stored credential. The behaviour degrades
 * gracefully — `get()` returns null, the connection flips to `needs_reauth`, the owner re-consents
 * through the flow that already exists — but it logs a warning, because otherwise it looks like a
 * bug in the OAuth code rather than a wiped cache.
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

    // Checked at construction, not at first use: a wrong-length key is a configuration error, and
    // discovering it when an owner is halfway through OAuth is strictly worse than at boot.
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
      // A key rotation makes every existing ciphertext undecryptable. Same graceful outcome as a
      // missing key, but worth its own message so it isn't mistaken for a flush.
      this.logger.error(
        `Failed to decrypt credential ${reference} — CREDENTIAL_ENCRYPTION_KEY may have changed: ${(error as Error).message}`
      );
      return null;
    }
  }

  async delete(reference: string): Promise<void> {
    await this.redis.del(`${KEY_PREFIX}${this.parseReference(reference)}`);
  }

  /**
   * Rejects a reference minted by a different store rather than returning null for it. A null here
   * is indistinguishable from "the owner's grant was revoked", so a misrouted reference would
   * present as a broken connection instead of the deployment error it actually is.
   */
  private parseReference(reference: string): string {
    const [scheme, ...rest] = reference.split(':');

    if (scheme !== SCHEME || rest.length === 0) {
      throw new Error(
        `Credential reference "${reference}" was not issued by the ${SCHEME} store. This node cannot resolve it.`
      );
    }

    return rest.join(':');
  }

  /** `iv:authTag:ciphertext`, all base64. GCM's auth tag is what makes this tamper-evident. */
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
