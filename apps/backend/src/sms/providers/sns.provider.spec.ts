import { GetSMSAttributesCommand, PublishCommand } from '@aws-sdk/client-sns';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { SnsSmsProvider } from './sns.provider';

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-sns', () => {
  return {
    SNSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PublishCommand: jest.fn().mockImplementation(input => ({ input })),
    GetSMSAttributesCommand: jest.fn().mockImplementation(input => ({ input })),
  };
});

describe('SnsSmsProvider', () => {
  let target: SnsSmsProvider;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          AWS_REGION: 'us-east-1',
          AWS_ACCESS_KEY_ID: 'key',
          AWS_SECRET_ACCESS_KEY: 'secret',
          AWS_SNS_SENDER_ID: 'MYAPP',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SnsSmsProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(SnsSmsProvider);
  });

  afterEach(() => jest.clearAllMocks());

  describe('send', () => {
    it('publishes the message via SNS and returns a sent result', async () => {
      mockSend.mockResolvedValue({ MessageId: 'sns-message-id' });

      const result = await target.send({ to: '+15551234567', body: 'hello' });

      expect(PublishCommand).toHaveBeenCalledWith(
        expect.objectContaining({ PhoneNumber: '+15551234567', Message: 'hello' })
      );
      expect(result).toEqual({ messageId: 'sns-message-id', status: 'sent' });
    });

    it('falls back to "unknown" messageId when SNS does not return one', async () => {
      mockSend.mockResolvedValue({});

      const result = await target.send({ to: '+15551234567', body: 'hello' });

      expect(result.messageId).toBe('unknown');
    });

    it('wraps SNS errors in an InternalServerErrorException', async () => {
      mockSend.mockRejectedValue(new Error('SNS unavailable'));

      await expect(target.send({ to: '+15551234567', body: 'hello' })).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(target.send({ to: '+15551234567', body: 'hello' })).rejects.toThrow(
        'SNS SMS send failed: SNS unavailable'
      );
    });
  });

  describe('checkDeliveryStatus', () => {
    it('queries account SMS attributes and returns "unknown" as a proxy status', async () => {
      mockSend.mockResolvedValue({});

      const result = await target.checkDeliveryStatus('sns-message-id');

      expect(GetSMSAttributesCommand).toHaveBeenCalled();
      expect(result).toBe('unknown');
    });

    it('wraps SNS errors in an InternalServerErrorException', async () => {
      mockSend.mockRejectedValue(new Error('SNS unavailable'));

      await expect(target.checkDeliveryStatus('sns-message-id')).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });
});
