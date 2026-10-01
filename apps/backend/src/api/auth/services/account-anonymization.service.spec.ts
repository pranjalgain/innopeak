import { AuthDbService } from '@db/repositories/auth/auth.db-service';
import { MediaService } from '@media/media.service';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { AccountAnonymizationService } from './account-anonymization.service';

describe('AccountAnonymizationService', () => {
  let target: AccountAnonymizationService;
  let mediaService: { deleteAvatarIfPresent: jest.Mock };
  let authDbService: { anonymizeUser: jest.Mock };

  beforeEach(async () => {
    mediaService = { deleteAvatarIfPresent: jest.fn().mockResolvedValue(undefined) };
    authDbService = { anonymizeUser: jest.fn().mockResolvedValue({ outcome: 'anonymized' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountAnonymizationService,
        { provide: MediaService, useValue: mediaService },
        { provide: AuthDbService, useValue: authDbService },
      ],
    }).compile();

    target = module.get(AccountAnonymizationService);
  });

  it("deletes the user's avatar before anonymizing the row", async () => {
    const order: string[] = [];
    mediaService.deleteAvatarIfPresent.mockImplementation(() => {
      order.push('avatar');
      return Promise.resolve();
    });
    authDbService.anonymizeUser.mockImplementation(() => {
      order.push('user');
      return Promise.resolve({ outcome: 'anonymized' });
    });

    await target.anonymizeUser('user-1');

    expect(mediaService.deleteAvatarIfPresent).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(authDbService.anonymizeUser).toHaveBeenCalledWith('user-1');
    expect(order).toEqual(['avatar', 'user']);
  });

  it('is idempotent — a second call on an already-anonymized user is harmless', async () => {
    authDbService.anonymizeUser.mockResolvedValue({ outcome: 'already_anonymized' });

    await expect(target.anonymizeUser('user-1')).resolves.toBeUndefined();
  });
});
