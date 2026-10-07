import type { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';

export abstract class EmailProvider {
  abstract send(options: SendEmailOptions): Promise<EmailSendResult>;

  /** Resolves true when the provider is reachable and configured. */
  abstract verify(): Promise<boolean>;
}
