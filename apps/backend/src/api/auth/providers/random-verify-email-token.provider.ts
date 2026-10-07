import { randomInt } from 'crypto';

import { VerifyEmailTokenProvider } from './verify-email-token.provider';

const OTP_LENGTH = 6;
const OTP_MAX_EXCLUSIVE = 10 ** OTP_LENGTH;

/**
 * An OTP rather than a link: email scanners and link-previewers prefetch URLs and would consume a
 * link token before the user sees it. Built with `new` in AuthModule's factory, so not `@Injectable()`.
 */
export class RandomVerifyEmailTokenProvider extends VerifyEmailTokenProvider {
  generate(): string {
    return randomInt(0, OTP_MAX_EXCLUSIVE).toString().padStart(OTP_LENGTH, '0');
  }
}
