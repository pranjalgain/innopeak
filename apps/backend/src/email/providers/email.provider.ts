import type { EmailSendResult, SendEmailOptions } from '@email/interfaces/email.interface';

export abstract class EmailProvider {
  /**
   * Send an email using the configured provider.
   */
  abstract send(options: SendEmailOptions): Promise<EmailSendResult>;

  /**
   * Verify the connection / credentials of the email provider.
   * Returns true if the provider is reachable and properly configured.
   */
  abstract verify(): Promise<boolean>;
}
