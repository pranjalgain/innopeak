import { TokenPurpose } from '@auth/enums/token-purpose.enum';

import { PURGEABLE_OTP_PURPOSES } from './auth.repository';

describe('token purposes', () => {
  /**
   * The regression this guards: the set-password OTP originally reused `TokenPurpose.RESET`,
   * which the auth API reference reserves for the (unbuilt) public forgot-password route. One
   * shared value would make `putSetPasswordOtp`'s upsert on `(user_id, purpose)` silently
   * invalidate a live reset token, and — worse — let a code minted behind an access token satisfy
   * a consume from that unauthenticated route, and vice versa.
   */
  it('keeps set_password distinct from the reset purpose reserved for forgot-password', () => {
    expect(TokenPurpose.SET_PASSWORD).not.toBe(TokenPurpose.RESET);
  });

  /**
   * The regression this guards: `deleteStaleOtpTokens` originally filtered on `verify_email`
   * alone, so every spent set-password OTP row survived the nightly sweep forever. Any purpose
   * this codebase mints has to appear here, or nothing ever cleans its rows up.
   */
  it('purges every purpose the app actually mints', () => {
    expect(PURGEABLE_OTP_PURPOSES).toContain(TokenPurpose.VERIFY_EMAIL);
    expect(PURGEABLE_OTP_PURPOSES).toContain(TokenPurpose.SET_PASSWORD);
  });
});
