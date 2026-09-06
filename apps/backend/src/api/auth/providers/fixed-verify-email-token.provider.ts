import { VerifyEmailTokenProvider } from './verify-email-token.provider';

/**
 * Dev-only: always returns the same configured value instead of a random one, so signup/login
 * can be exercised without reading a real email. Swapped in via AuthModule's factory, gated by
 * DEV_VERIFY_EMAIL_TOKEN + !isProduction() — never reachable in production (also enforced at
 * boot by env-config.module.ts's Joi schema). Should be set to a 6-digit numeric string so it
 * fits the frontend's OTP entry boxes. Constructed directly with `new`, same as EmailModule's
 * provider factory does for SmtpEmailProvider/NoopEmailProvider — not resolved through Nest's DI
 * container.
 */
export class FixedVerifyEmailTokenProvider extends VerifyEmailTokenProvider {
  constructor(private readonly token: string) {
    super();
  }

  generate(): string {
    return this.token;
  }
}
