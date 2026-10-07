import { VerifyEmailTokenProvider } from './verify-email-token.provider';

/**
 * Dev-only fixed OTP so signup/login works without reading email. Never reachable in production
 * (also enforced by the Joi schema in env-config.module.ts); use a 6-digit string to fit the OTP boxes.
 */
export class FixedVerifyEmailTokenProvider extends VerifyEmailTokenProvider {
  constructor(private readonly token: string) {
    super();
  }

  generate(): string {
    return this.token;
  }
}
