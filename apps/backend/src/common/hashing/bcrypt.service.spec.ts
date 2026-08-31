import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { BcryptService } from './bcrypt.service';

describe('BcryptService', () => {
  let target: BcryptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BcryptService],
    }).compile();
    target = module.get(BcryptService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('hash', () => {
    it('produces a bcrypt hash that is different from the plain input', async () => {
      const plain = 'super-secret-password';

      const hashed = await target.hash(plain);

      expect(hashed).toEqual(expect.any(String));
      expect(hashed).not.toEqual(plain);
      // bcrypt hashes start with a version identifier such as $2a$, $2b$, or $2y$
      expect(hashed).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('produces a different hash each time due to random salt generation', async () => {
      const plain = 'same-password';

      const [first, second] = await Promise.all([target.hash(plain), target.hash(plain)]);

      expect(first).not.toEqual(second);
    });
  });

  describe('compare', () => {
    it('resolves to true when the plain value matches the hash', async () => {
      const plain = 'round-trip-password';
      const hashed = await target.hash(plain);

      await expect(target.compare(plain, hashed)).resolves.toBe(true);
    });

    it('resolves to false when the plain value does not match the hash', async () => {
      const hashed = await target.hash('correct-password');

      await expect(target.compare('wrong-password', hashed)).resolves.toBe(false);
    });
  });
});
