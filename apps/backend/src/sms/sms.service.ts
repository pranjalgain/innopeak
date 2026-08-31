import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

import { randomInt } from 'crypto';

import { OtpOptions, SendSmsOptions, SmsResult } from './interfaces/sms.interface';
import { SmsProvider } from './providers/sms.provider';

/** Prefix used for OTP cache keys to avoid collisions. */
const OTP_CACHE_PREFIX = 'sms:otp:';

/** Default OTP length (number of digits). */
const DEFAULT_OTP_LENGTH = 6;

/** Default OTP validity window in minutes. */
const DEFAULT_OTP_EXPIRY_MINUTES = 5;

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly smsProvider: SmsProvider,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  /**
   * Send an SMS message through the configured provider.
   * @param options - Recipient, body, and optional sender override.
   * @returns The provider result containing messageId and status.
   */
  async sendSms(options: SendSmsOptions): Promise<SmsResult> {
    this.logger.log(`Sending SMS to ${options.to}`);
    return this.smsProvider.send(options);
  }

  /**
   * Generate a numeric OTP, store it in cache, and send it via SMS.
   *
   * @param options - Recipient phone, optional OTP length, optional expiry.
   * @returns The generated OTP (for logging/testing only) and the provider messageId.
   */
  async sendOtp(options: OtpOptions): Promise<{ otp: string; messageId: string }> {
    const length = options.length ?? DEFAULT_OTP_LENGTH;
    const expiresInMinutes = options.expiresInMinutes ?? DEFAULT_OTP_EXPIRY_MINUTES;

    // Generate a cryptographically random numeric OTP
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const otp = randomInt(min, max + 1).toString();

    // Store OTP in cache with TTL
    const cacheKey = `${OTP_CACHE_PREFIX}${options.to}`;
    const ttlMs = expiresInMinutes * 60 * 1000;
    await this.cacheManager.set(cacheKey, otp, ttlMs);

    this.logger.log(`OTP generated for ${options.to} (expires in ${expiresInMinutes}min)`);

    // Send the OTP via SMS
    const result = await this.smsProvider.send({
      to: options.to,
      body: `Your verification code is: ${otp}. It expires in ${expiresInMinutes} minute(s).`,
    });

    return { otp, messageId: result.messageId };
  }

  /**
   * Verify an OTP that was previously sent to a phone number.
   * The OTP is consumed (deleted) on successful verification to prevent replay.
   *
   * @param to - The phone number the OTP was sent to.
   * @param otp - The OTP code to verify.
   * @returns True if the OTP matches, false otherwise.
   */
  async verifyOtp(to: string, otp: string): Promise<boolean> {
    const cacheKey = `${OTP_CACHE_PREFIX}${to}`;
    const storedOtp = await this.cacheManager.get<string>(cacheKey);

    if (!storedOtp) {
      this.logger.warn(`OTP verification failed for ${to}: no OTP found or expired`);
      throw new BadRequestException('OTP has expired or was never sent to this number');
    }

    if (storedOtp !== otp) {
      this.logger.warn(`OTP verification failed for ${to}: code mismatch`);
      return false;
    }

    // Consume the OTP so it cannot be reused
    await this.cacheManager.del(cacheKey);
    this.logger.log(`OTP verified successfully for ${to}`);
    return true;
  }

  /**
   * Check the delivery status of a previously sent message.
   * @param messageId - The provider-assigned message identifier.
   * @returns The current delivery status string.
   */
  async checkDeliveryStatus(messageId: string): Promise<string> {
    return this.smsProvider.checkDeliveryStatus(messageId);
  }
}
