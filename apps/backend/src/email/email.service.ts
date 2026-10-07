import { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';
import { EmailProvider } from '@email/providers/email.provider';
import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';

import { readFile } from 'fs/promises';
import { join } from 'path';

type TemplateDelegate = (context: Record<string, unknown>) => string;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly templateCache = new Map<string, TemplateDelegate>();
  private readonly templatesDir: string;

  constructor(private readonly emailProvider: EmailProvider) {
    // Relative to the compiled output (dist/) at runtime
    this.templatesDir = join(__dirname, 'templates');
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailSendResult> {
    this.logger.debug(
      `Sending email to ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`
    );
    return this.emailProvider.send(options);
  }

  async sendTemplateEmail(
    to: string[] | string,
    templateName: string,
    data: Record<string, unknown>,
    overrides?: Pick<SendEmailOptions, 'attachments' | 'from' | 'replyTo' | 'subject'>
  ): Promise<EmailSendResult> {
    const html = await this.compileTemplate(templateName, data);

    const subject = overrides?.subject ?? this.deriveSubject(templateName, data);

    // exactOptionalPropertyTypes forbids assigning undefined to optional properties
    const options: SendEmailOptions = {
      to,
      subject,
      html,
    };

    if (overrides?.from !== undefined) {
      options.from = overrides.from;
    }
    if (overrides?.replyTo !== undefined) {
      options.replyTo = overrides.replyTo;
    }
    if (overrides?.attachments !== undefined) {
      options.attachments = overrides.attachments;
    }

    return this.sendEmail(options);
  }

  private async compileTemplate(
    templateName: string,
    data: Record<string, unknown>
  ): Promise<string> {
    let compiled = this.templateCache.get(templateName);

    if (!compiled) {
      const templatePath = join(this.templatesDir, `${templateName}.hbs`);
      const templateSource = await readFile(templatePath, 'utf-8');
      compiled = Handlebars.compile(templateSource);
      this.templateCache.set(templateName, compiled);
      this.logger.debug(`Compiled and cached template: ${templateName}`);
    }

    return compiled(data);
  }

  private deriveSubject(templateName: string, data: Record<string, unknown>): string {
    const titleFromData = data['subject'] ?? data['title'];
    if (typeof titleFromData === 'string') {
      return titleFromData;
    }

    return templateName.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  }
}
