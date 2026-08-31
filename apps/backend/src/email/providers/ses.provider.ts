import { SendRawEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { getAwsEndpointOverride, getFlociCredentials } from '@common/helpers/aws-endpoint.util';
import { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';
import { EmailProvider } from '@email/providers/email.provider';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SesEmailProvider extends EmailProvider {
  private readonly logger = new Logger(SesEmailProvider.name);
  private readonly sesClient: SESClient;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    super();

    const region = this.configService.get<string>('AWS_REGION') ?? 'us-east-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? '';
    this.defaultFrom = this.configService.get<string>('EMAIL_FROM') ?? 'noreply@example.com';

    const clientConfig: ConstructorParameters<typeof SESClient>[0] = { region };
    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }
    const endpoint = getAwsEndpointOverride(this.configService);
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }
    const flociCredentials = getFlociCredentials(this.configService);
    if (flociCredentials) {
      clientConfig.credentials = flociCredentials;
    }
    this.sesClient = new SESClient(clientConfig);
  }

  async send(options: SendEmailOptions): Promise<EmailSendResult> {
    const { to, subject, html, text, from, replyTo } = options;
    const sender = from ?? this.defaultFrom;
    const recipients = Array.isArray(to) ? to : [to];

    // TODO: Build full MIME message with attachments support
    // For now, construct a basic raw email message
    const boundary = `----=_Part_${Date.now()}`;
    const rawParts: string[] = [
      `From: ${sender}`,
      `To: ${recipients.join(', ')}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
    ];

    if (replyTo) {
      rawParts.push(`Reply-To: ${replyTo}`);
    }

    if (html && text) {
      rawParts.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      rawParts.push('');
      rawParts.push(`--${boundary}`);
      rawParts.push('Content-Type: text/plain; charset=UTF-8');
      rawParts.push('');
      rawParts.push(text);
      rawParts.push(`--${boundary}`);
      rawParts.push('Content-Type: text/html; charset=UTF-8');
      rawParts.push('');
      rawParts.push(html);
      rawParts.push(`--${boundary}--`);
    } else if (html) {
      rawParts.push('Content-Type: text/html; charset=UTF-8');
      rawParts.push('');
      rawParts.push(html);
    } else {
      rawParts.push('Content-Type: text/plain; charset=UTF-8');
      rawParts.push('');
      rawParts.push(text ?? '');
    }

    const rawMessage = rawParts.join('\r\n');

    const command = new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawMessage),
      },
      Source: sender,
      Destinations: recipients,
    });

    const result = await this.sesClient.send(command);

    const messageId = result.MessageId ?? `ses-${Date.now()}`;
    this.logger.debug(`Email sent via SES: messageId=${messageId}`);

    return { messageId };
  }

  verify(): Promise<boolean> {
    // TODO: Implement SES identity verification check
    // Could call GetSendQuota to validate credentials
    this.logger.warn('SES verify() is not yet implemented; returning true');
    return Promise.resolve(true);
  }
}
