import type { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';

export abstract class EmailProvider {
  abstract send(options: SendEmailOptions): Promise<EmailSendResult>;

  /** Resolves true when the provider is reachable and configured. */
  abstract verify(): Promise<boolean>;

  /**
   * Whether mail sent through this provider really leaves for a recipient, judged from settings alone (no network): the answer to "is
   * there an email service set up?". `verify()` cannot stand in for it, since it says nothing about a provider that sends nowhere.
   */
  abstract isConfigured(): boolean;
}
