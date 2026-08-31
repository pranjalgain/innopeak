import { CronJobName } from '@bg/constants/job.constant';
import type { ICronJob } from '@bg/interfaces/job.interface';
import { Logger } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { CronService } from './cron.service';

describe('CronService', () => {
  let target: CronService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CronService],
    }).compile();
    target = module.get(CronService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendDailyMail', () => {
    it('logs the daily mail job when data is provided', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
      const data: ICronJob = { jobType: CronJobName.DAILY_MAIL, data: { foo: 'bar' } };

      expect(() => {
        target.sendDailyMail(data);
      }).not.toThrow();
      expect(debugSpy).toHaveBeenCalledWith('Sending Daily mail', data);
    });

    it('logs the daily mail job when called without data', () => {
      const debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      expect(() => {
        target.sendDailyMail();
      }).not.toThrow();
      expect(debugSpy).toHaveBeenCalledWith('Sending Daily mail', undefined);
    });

    it('returns undefined (void, synchronous)', () => {
      jest.spyOn(Logger.prototype, 'debug').mockImplementation();

      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- asserting the void return is genuinely `undefined` at runtime is the point of this test
      const result = target.sendDailyMail();

      expect(result).toBeUndefined();
    });
  });
});
