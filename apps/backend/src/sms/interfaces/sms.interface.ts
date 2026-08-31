/**
 * Options for sending an SMS message.
 */
export interface SendSmsOptions {
  /** Recipient phone number in E.164 format (e.g. +14155552671) */
  to: string;
  /** The message body */
  body: string;
  /** Override the default sender/from number */
  from?: string;
}

/**
 * Result returned after attempting to send an SMS.
 */
export interface SmsResult {
  /** Provider-assigned message identifier */
  messageId: string;
  /** Delivery status (e.g. 'queued', 'sent', 'delivered', 'failed') */
  status: string;
}

/**
 * Options for generating and sending a one-time password via SMS.
 */
export interface OtpOptions {
  /** Recipient phone number in E.164 format */
  to: string;
  /** Number of digits in the OTP (default: 6) */
  length?: number;
  /** OTP validity window in minutes (default: 5) */
  expiresInMinutes?: number;
}

/**
 * Supported SMS provider backends.
 */
export type SmsProviderType = 'sns' | 'twilio';
