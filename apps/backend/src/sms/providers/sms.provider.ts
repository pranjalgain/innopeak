import { Injectable } from '@nestjs/common';

import { SendSmsOptions, SmsResult } from '../interfaces/sms.interface';

/**
 * Abstract SMS provider that all concrete providers must implement.
 * Uses the Strategy pattern so providers can be swapped via configuration.
 */
@Injectable()
export abstract class SmsProvider {
  /**
   * Send an SMS message through the provider.
   * @param options - The message details (to, body, optional from).
   * @returns A Promise resolving to the send result with messageId and status.
   */
  abstract send(options: SendSmsOptions): Promise<SmsResult>;

  /**
   * Check the delivery status of a previously sent message.
   * @param messageId - The provider-assigned message identifier.
   * @returns A Promise resolving to the current delivery status string.
   */
  abstract checkDeliveryStatus(messageId: string): Promise<string>;
}
