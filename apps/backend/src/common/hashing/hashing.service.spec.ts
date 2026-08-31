import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { HashingService } from './hashing.service';

class TestHashingService extends HashingService {
  hash(data: Buffer | string): Promise<string> {
    return Promise.resolve(`hashed:${data.toString()}`);
  }

  compare(data: Buffer | string, encrypted: string): Promise<boolean> {
    return Promise.resolve(encrypted === `hashed:${data.toString()}`);
  }
}

describe('HashingService', () => {
  let target: HashingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [{ provide: HashingService, useClass: TestHashingService }],
    }).compile();
    target = module.get(HashingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('hash', () => {
    it('is implemented by concrete subclasses and returns a hashed value', async () => {
      await expect(target.hash('plain-value')).resolves.toBe('hashed:plain-value');
    });

    it('accepts Buffer input as well as string input', async () => {
      await expect(target.hash(Buffer.from('buffer-value'))).resolves.toBe('hashed:buffer-value');
    });
  });

  describe('compare', () => {
    it('returns true when the data matches the encrypted value', async () => {
      await expect(target.compare('plain-value', 'hashed:plain-value')).resolves.toBe(true);
    });

    it('returns false when the data does not match the encrypted value', async () => {
      await expect(target.compare('plain-value', 'hashed:other-value')).resolves.toBe(false);
    });
  });
});
