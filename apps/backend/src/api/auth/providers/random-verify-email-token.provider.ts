import { randomInt } from 'crypto';

import { VerifyEmailTokenProvider } from './verify-email-token.provider';

const OTP_LENGTH = 6;
const OTP_MAX_EXCLUSIVE = 10 ** OTP_LENGTH;

/**
 * Production default — a 6-digit numeric OTP (delivered by email, typed into the frontend's OTP
 * stepper), not a clickable link: a link's token could be silently consumed by an email security
 * scanner or link-preview bot prefetching the URL before the real user ever saw it, whereas a
 * code the user has to read and type by hand doesn't have that exposure. `crypto.randomInt` (not
 * `Math.random`) for cryptographic unpredictability. Constructed directly with `new` in
 * AuthModule's factory, same as FixedVerifyEmailTokenProvider — neither goes through Nest's DI
 * container, so neither is `@Injectable()`.
 */
export class RandomVerifyEmailTokenProvider extends VerifyEmailTokenProvider {
  generate(): string {
    return randomInt(0, OTP_MAX_EXCLUSIVE).toString().padStart(OTP_LENGTH, '0');
  }
}
