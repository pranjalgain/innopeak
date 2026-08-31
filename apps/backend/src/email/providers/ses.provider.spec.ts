import { SendRawEmailCommand } from '@aws-sdk/client-ses';
import type { SendEmailOptions } from '@email/interfaces/email.interface';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { SesEmailProvider } from './ses.provider';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-ses', () => {
  return {
    SESClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    SendRawEmailCommand: jest.fn().mockImplementation(input => ({ input })),
  };
});

describe('SesEmailProvider', () => {
  let target: SesEmailProvider;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          AWS_REGION: 'us-east-1',
          AWS_ACCESS_KEY_ID: 'key',
          AWS_SECRET_ACCESS_KEY: 'secret',
          EMAIL_FROM: 'noreply@example.com',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SesEmailProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(SesEmailProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('send', () => {
    it('builds a raw email message and sends it via the SES client', async () => {
      mockSend.mockResolvedValue({ MessageId: 'ses-message-id' });

      const options: SendEmailOptions = {
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      };

      const result = await target.send(options);

      expect(SendRawEmailCommand).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ messageId: 'ses-message-id' });
    });

    it('falls back to a generated messageId when SES does not return one', async () => {
      mockSend.mockResolvedValue({});

      const result = await target.send({ to: 'user@example.com', subject: 'Hi', text: 'body' });

      expect(result.messageId).toMatch(/^ses-\d+$/);
    });

    it('propagates errors raised by the SES client', async () => {
      mockSend.mockRejectedValue(new Error('SES throttled'));

      await expect(
        target.send({ to: 'user@example.com', subject: 'Hi', text: 'body' })
      ).rejects.toThrow('SES throttled');
    });
  });

  describe('verify', () => {
    it('resolves true (not yet implemented against SES)', async () => {
      await expect(target.verify()).resolves.toBe(true);
    });
  });
});
