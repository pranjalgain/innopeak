import { GetSMSAttributesCommand, PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { getAwsEndpointOverride, getFlociCredentials } from '@common/helpers/aws-endpoint.util';
import { EnvConfig } from '@config/env.config';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SmsProvider } from './sms.provider';

import { SendSmsOptions, SmsResult } from '../interfaces/sms.interface';

/**
 * Amazon SNS implementation of the SMS provider.
 * Uses the AWS SDK v3 SNSClient to publish SMS messages.
 *
 * Note: SNS does not natively support per-message delivery status lookups
 * in the same way Twilio does. For production use, configure SNS delivery
 * status logging to CloudWatch and query from there.
 */
@Injectable()
export class SnsSmsProvider extends SmsProvider {
  private readonly logger = new Logger(SnsSmsProvider.name);
  private readonly snsClient: SNSClient;
  private readonly defaultSenderId: string;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();

    const region = this.configService.get<string>('AWS_REGION' as keyof EnvConfig) ?? 'us-east-1';
    const accessKeyId =
      this.configService.get<string>('AWS_ACCESS_KEY_ID' as keyof EnvConfig) ?? '';
    const secretAccessKey =
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY' as keyof EnvConfig) ?? '';
    this.defaultSenderId =
      this.configService.get<string>('AWS_SNS_SENDER_ID' as keyof EnvConfig) ?? '';

    const clientConfig: ConstructorParameters<typeof SNSClient>[0] = { region };

    // Only supply explicit credentials if both are present;
    // otherwise fall back to the default AWS credential chain (IAM role, env, etc.)
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }

    const endpoint = getAwsEndpointOverride(this.configService);
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }

    const flociCredentials = getFlociCredentials(this.configService);
    if (flociCredentials) {
      clientConfig.credentials = flociCredentials;
    }

    this.snsClient = new SNSClient(clientConfig);
  }

  /**
   * Publish an SMS message via Amazon SNS.
   */
  async send(options: SendSmsOptions): Promise<SmsResult> {
    const senderId = options.from ?? this.defaultSenderId;

    const messageAttributes: Record<string, { DataType: string; StringValue: string }> = {};

    if (senderId) {
      messageAttributes['AWS.SNS.SMS.SenderID'] = {
        DataType: 'String',
        StringValue: senderId,
      };
    }

    // Default to Transactional for OTP / verification messages
    messageAttributes['AWS.SNS.SMS.SMSType'] = {
      DataType: 'String',
      StringValue: 'Transactional',
    };

    try {
      const command = new PublishCommand({
        PhoneNumber: options.to,
        Message: options.body,
        MessageAttributes: messageAttributes,
      });

      const result = await this.snsClient.send(command);
      const messageId = result.MessageId ?? 'unknown';

      this.logger.log(`SMS sent to ${options.to} | MessageId: ${messageId}`);

      return {
        messageId,
        status: 'sent',
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown SNS error';
      this.logger.error(`Failed to send SMS to ${options.to}: ${errMsg}`);
      throw new InternalServerErrorException(`SNS SMS send failed: ${errMsg}`);
    }
  }

  /**
   * Check delivery status for an SNS message.
   *
   * SNS does not provide a direct message-status API like Twilio.
   * In production, enable SNS delivery status logging to CloudWatch
   * and query logs via CloudWatch Logs Insights.
   *
   * This method returns the account-level SMS spending status as a proxy;
   * for per-message tracking, integrate with CloudWatch.
   */
  async checkDeliveryStatus(messageId: string): Promise<string> {
    try {
      const command = new GetSMSAttributesCommand({
        attributes: ['DefaultSMSType', 'MonthlySpendLimit', 'UsageReportS3Bucket'],
      });

      await this.snsClient.send(command);

      this.logger.warn(
        `SNS does not support per-message delivery status lookups. ` +
          `MessageId ${messageId} status cannot be individually queried. ` +
          `Configure CloudWatch delivery status logging for granular tracking.`
      );

      return 'unknown';
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : 'Unknown SNS error';
      this.logger.error(`Failed to check SMS attributes for ${messageId}: ${errMsg}`);
      throw new InternalServerErrorException(`SNS status check failed: ${errMsg}`);
    }
  }
}
