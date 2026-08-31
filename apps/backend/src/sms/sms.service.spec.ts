import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { SmsProvider } from './providers/sms.provider';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  let target: SmsService;
  let smsProvider: { send: jest.Mock; checkDeliveryStatus: jest.Mock };
  let cacheManager: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    smsProvider = { send: jest.fn(), checkDeliveryStatus: jest.fn() };
    cacheManager = { get: jest.fn(), set: jest.fn(), del: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsService,
        { provide: SmsProvider, useValue: smsProvider },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    target = module.get(SmsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('sendSms', () => {
    it('delegates to the configured sms provider and returns its result', async () => {
      const expected = { messageId: 'msg-1', status: 'sent' };
      smsProvider.send.mockResolvedValue(expected);

      const result = await target.sendSms({ to: '+15551234567', body: 'hello' });

      expect(smsProvider.send).toHaveBeenCalledWith({ to: '+15551234567', body: 'hello' });
      expect(result).toEqual(expected);
    });

    it('propagates errors thrown by the provider', async () => {
      smsProvider.send.mockRejectedValue(new Error('carrier rejected'));

      await expect(target.sendSms({ to: '+15551234567', body: 'hello' })).rejects.toThrow(
        'carrier rejected'
      );
    });
  });

  describe('sendOtp', () => {
    it('generates a numeric OTP, caches it with the default TTL and sends it via SMS', async () => {
      smsProvider.send.mockResolvedValue({ messageId: 'otp-msg-1', status: 'sent' });

      const result = await target.sendOtp({ to: '+15551234567' });

      expect(result.otp).toMatch(/^\d{6}$/);
      expect(cacheManager.set).toHaveBeenCalledWith(
        'sms:otp:+15551234567',
        result.otp,
        5 * 60 * 1000
      );
      expect(smsProvider.send).toHaveBeenCalledWith({
        to: '+15551234567',
        body: expect.stringContaining(result.otp),
      });
      expect(result.messageId).toBe('otp-msg-1');
    });

    it('respects a custom length and expiry window', async () => {
      smsProvider.send.mockResolvedValue({ messageId: 'otp-msg-2', status: 'sent' });

      const result = await target.sendOtp({ to: '+15551234567', length: 4, expiresInMinutes: 10 });

      expect(result.otp).toMatch(/^\d{4}$/);
      expect(cacheManager.set).toHaveBeenCalledWith(
        'sms:otp:+15551234567',
        result.otp,
        10 * 60 * 1000
      );
    });
  });

  describe('verifyOtp', () => {
    it('returns true and consumes the OTP when it matches the cached value', async () => {
      cacheManager.get.mockResolvedValue('123456');

      const result = await target.verifyOtp('+15551234567', '123456');

      expect(result).toBe(true);
      expect(cacheManager.del).toHaveBeenCalledWith('sms:otp:+15551234567');
    });

    it('returns false and keeps the cache entry when the OTP does not match', async () => {
      cacheManager.get.mockResolvedValue('123456');

      const result = await target.verifyOtp('+15551234567', '000000');

      expect(result).toBe(false);
      expect(cacheManager.del).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no OTP is found (expired or never sent)', async () => {
      cacheManager.get.mockResolvedValue(undefined);

      await expect(target.verifyOtp('+15551234567', '123456')).rejects.toThrow(BadRequestException);
      expect(cacheManager.del).not.toHaveBeenCalled();
    });
  });

  describe('checkDeliveryStatus', () => {
    it('delegates to the configured sms provider', async () => {
      smsProvider.checkDeliveryStatus.mockResolvedValue('delivered');

      const result = await target.checkDeliveryStatus('msg-1');

      expect(smsProvider.checkDeliveryStatus).toHaveBeenCalledWith('msg-1');
      expect(result).toBe('delivered');
    });
  });
});
