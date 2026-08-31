import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import Twilio from 'twilio';

import { TwilioSmsProvider } from './twilio.provider';

const mockCreate = jest.fn();
const mockFetch = jest.fn();
const messagesFn = Object.assign(jest.fn().mockReturnValue({ fetch: mockFetch }), {
  create: mockCreate,
});

jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: messagesFn,
  }));
});

describe('TwilioSmsProvider', () => {
  let target: TwilioSmsProvider;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          TWILIO_ACCOUNT_SID: 'AC123',
          TWILIO_AUTH_TOKEN: 'token123',
          TWILIO_PHONE_NUMBER: '+15550000000',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TwilioSmsProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(TwilioSmsProvider);
  });

  afterEach(() => jest.clearAllMocks());

  it('constructs the Twilio client with the configured credentials', () => {
    expect(Twilio).toHaveBeenCalledWith('AC123', 'token123');
  });

  describe('send', () => {
    it('sends the message via the Twilio Messages API and returns the sid/status', async () => {
      mockCreate.mockResolvedValue({ sid: 'SM123', status: 'queued' });

      const result = await target.send({ to: '+15551234567', body: 'hello' });

      expect(mockCreate).toHaveBeenCalledWith({
        to: '+15551234567',
        from: '+15550000000',
        body: 'hello',
      });
      expect(result).toEqual({ messageId: 'SM123', status: 'queued' });
    });

    it('uses the explicit "from" override when provided', async () => {
      mockCreate.mockResolvedValue({ sid: 'SM124', status: 'queued' });

      await target.send({ to: '+15551234567', body: 'hello', from: '+19998887777' });

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ from: '+19998887777' }));
    });

    it('wraps Twilio API errors in an InternalServerErrorException', async () => {
      mockCreate.mockRejectedValue(new Error('Twilio outage'));

      await expect(target.send({ to: '+15551234567', body: 'hello' })).rejects.toThrow(
        InternalServerErrorException
      );
      await expect(target.send({ to: '+15551234567', body: 'hello' })).rejects.toThrow(
        'Twilio SMS send failed: Twilio outage'
      );
    });
  });

  describe('checkDeliveryStatus', () => {
    it('fetches the message and returns its status', async () => {
      mockFetch.mockResolvedValue({ status: 'delivered' });

      const result = await target.checkDeliveryStatus('SM123');

      expect(messagesFn).toHaveBeenCalledWith('SM123');
      expect(result).toBe('delivered');
    });

    it('wraps Twilio API errors in an InternalServerErrorException', async () => {
      mockFetch.mockRejectedValue(new Error('not found'));

      await expect(target.checkDeliveryStatus('SM123')).rejects.toThrow(
        InternalServerErrorException
      );
    });
  });
});

describe('TwilioSmsProvider without a configured "from" number', () => {
  let target: TwilioSmsProvider;

  beforeEach(async () => {
    const configService = { get: jest.fn().mockReturnValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TwilioSmsProvider, { provide: ConfigService, useValue: configService }],
    }).compile();

    target = module.get(TwilioSmsProvider);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws InternalServerErrorException when no sender number is available', async () => {
    await expect(target.send({ to: '+15551234567', body: 'hello' })).rejects.toThrow(
      'No sender phone number provided'
    );
  });
});
