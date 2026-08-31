import { EnvConfig } from '@config/env.config';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

import { SmsProvider } from './sms.provider';

import { SendSmsOptions, SmsResult } from '../interfaces/sms.interface';

/**
 * Twilio implementation of the SMS provider.
 * Reads credentials from environment variables and delegates to the Twilio REST API.
 */
@Injectable()
export class TwilioSmsProvider extends SmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly client: ReturnType<typeof Twilio>;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();

    const accountSid =
      this.configService.get<string>('TWILIO_ACCOUNT_SID' as keyof EnvConfig) ?? '';
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN' as keyof EnvConfig) ?? '';
    this.defaultFrom =
      this.configService.get<string>('TWILIO_PHONE_NUMBER' as keyof EnvConfig) ?? '';

    if (!accountSid || !authToken) {
      this.logger.warn(
        'Twilio credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN) are not configured. ' +
          'SMS sending will fail until they are set.'
      );
    }

    this.client = Twilio(accountSid, authToken);
  }

  /**
   * Send an SMS via the Twilio Messages API.
   * Falls back to the configured TWILIO_PHONE_NUMBER if no `from` is specified.
   */
  async send(options: SendSmsOptions): Promise<SmsResult> {
    const from = options.from ?? this.defaultFrom;

    if (!from) {
      throw new InternalServerErrorException(
        'No sender phone number provided. Set TWILIO_PHONE_NUMBER or pass `from` in options.'
      );
    }

    try {
      const message = await this.client.messages.create({
        to: options.to,
        from,
        body: options.body,
      });

      this.logger.log(
        `SMS sent to ${options.to} | SID: ${message.sid} | Status: ${message.status}`
      );

      return {
        messageId: message.sid,
        status: message.status,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown Twilio error';
      this.logger.error(`Failed to send SMS to ${options.to}: ${errMsg}`);
      throw new InternalServerErrorException(`Twilio SMS send failed: ${errMsg}`);
    }
  }

  /**
   * Fetch the current delivery status of a message by its SID.
   */
  async checkDeliveryStatus(messageId: string): Promise<string> {
    try {
      const message = await this.client.messages(messageId).fetch();
      this.logger.log(`Delivery status for ${messageId}: ${message.status}`);
      return message.status;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown Twilio error';
      this.logger.error(`Failed to check delivery status for ${messageId}: ${errMsg}`);
      throw new InternalServerErrorException(`Twilio status check failed: ${errMsg}`);
    }
  }
}
