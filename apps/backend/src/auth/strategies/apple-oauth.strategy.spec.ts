import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AppleOAuthStrategy } from './apple-oauth.strategy';

describe('AppleOAuthStrategy', () => {
  let target: AppleOAuthStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppleOAuthStrategy],
    }).compile();

    target = module.get(AppleOAuthStrategy);
  });

  afterEach(() => jest.clearAllMocks());

  describe('validate', () => {
    it('throws because Apple Sign-In is not yet implemented', () => {
      expect(() => target.validate()).toThrow('Apple OAuth strategy is not yet implemented');
    });
  });
});
