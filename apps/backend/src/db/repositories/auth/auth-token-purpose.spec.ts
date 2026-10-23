import { TokenPurpose } from '@auth/enums/token-purpose.enum';

import { PURGEABLE_OTP_PURPOSES } from './auth.repository';

describe('token purposes', () => {
  // Guards a shared value: the upsert on (user_id, purpose) would invalidate a live reset token, and a
  // code minted behind an access token could satisfy the unauthenticated forgot-password consume.
  it('keeps set_password distinct from the reset purpose reserved for forgot-password', () => {
    expect(TokenPurpose.SET_PASSWORD).not.toBe(TokenPurpose.RESET);
  });

  // Guards `deleteStaleOtpTokens` filtering on verify_email alone, which left spent rows of other purposes forever.
  it('purges every purpose the app actually mints', () => {
    expect(PURGEABLE_OTP_PURPOSES).toContain(TokenPurpose.VERIFY_EMAIL);
    expect(PURGEABLE_OTP_PURPOSES).toContain(TokenPurpose.SET_PASSWORD);
    // Spent delete-account codes were never swept.
    expect(PURGEABLE_OTP_PURPOSES).toContain(TokenPurpose.DELETE_ACCOUNT);
    expect(PURGEABLE_OTP_PURPOSES).toContain(TokenPurpose.INVITE);
  });
});
