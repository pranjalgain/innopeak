import { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';
import { EmailProvider } from '@email/providers/email.provider';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';

@Injectable()
export class SmtpEmailProvider extends EmailProvider implements OnModuleInit {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private readonly transporter: Transporter<SMTPTransport.SentMessageInfo>;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    super();

    const host = this.configService.get<string>('SMTP_HOST') ?? 'localhost';
    const port = this.configService.get<number>('SMTP_PORT') ?? 587;
    const user = this.configService.get<string>('SMTP_USER') ?? '';
    const pass = this.configService.get<string>('SMTP_PASSWORD') ?? '';
    this.defaultFrom = this.configService.get<string>('EMAIL_FROM') ?? 'noreply@example.com';

    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure: port === 465,
    };

    if (user && pass) {
      transportOptions.auth = { user, pass };
    }

    this.transporter = createTransport(transportOptions);
  }

  async onModuleInit(): Promise<void> {
    try {
      const verified = await this.verify();
      if (verified) {
        this.logger.log('SMTP connection verified successfully');
      }
    } catch (error) {
      this.logger.warn(
        `SMTP connection verification failed: ${(error as Error).message}. Emails may not be sent.`
      );
    }
  }

  async send(options: SendEmailOptions): Promise<EmailSendResult> {
    const { to, subject, html, text, from, replyTo, attachments } = options;

    const mailOptions: SMTPTransport.Options = {
      from: from ?? this.defaultFrom,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
    };

    if (html !== undefined) {
      mailOptions.html = html;
    }
    if (text !== undefined) {
      mailOptions.text = text;
    }
    if (replyTo !== undefined) {
      mailOptions.replyTo = replyTo;
    }
    if (attachments !== undefined) {
      mailOptions.attachments = attachments.map(a => {
        const attachment: { filename: string; content: Buffer | string; contentType?: string } = {
          filename: a.filename,
          content: a.content,
        };
        if (a.contentType !== undefined) {
          attachment.contentType = a.contentType;
        }
        return attachment;
      });
    }

    const result = await this.transporter.sendMail(mailOptions);

    this.logger.debug(`Email sent via SMTP: messageId=${result.messageId}`);

    return { messageId: result.messageId };
  }

  async verify(): Promise<boolean> {
    await this.transporter.verify();
    return true;
  }
}
