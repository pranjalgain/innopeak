import { MESSAGES } from '@common/constants/messages.constants';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '@review-provider/errors/provider.error';

import { describeSyncFailure } from './describe-sync-failure.util';

describe('describeSyncFailure', () => {
  it.each([
    [
      new ProviderAuthError('invalid_grant: Token has been expired or revoked.'),
      MESSAGES.REVIEWS.SYNC_FAILED_AUTH,
    ],
    [
      new ProviderRateLimitError('RESOURCE_EXHAUSTED quota 60/min', 30),
      MESSAGES.REVIEWS.SYNC_FAILED_RATE_LIMITED,
    ],
    [new ProviderUnavailableError('503 backend error'), MESSAGES.REVIEWS.SYNC_FAILED_UNAVAILABLE],
  ])('words %j in our own terms', (error, expected) => {
    expect(describeSyncFailure(error)).toBe(expected);
  });

  // The raw text of a database failure is SQL and bound values; a provider's is up to 500 characters of English.
  it('never passes any error text through, whatever the failure', () => {
    const sql = new Error(
      'Failed query: select * from users where email = $1\nparams: jane@example.com'
    );

    expect(describeSyncFailure(sql)).toBe(MESSAGES.REVIEWS.SYNC_FAILED_UNKNOWN);
    expect(describeSyncFailure(sql)).not.toContain('jane@example.com');
    expect(describeSyncFailure('a thrown string')).toBe(MESSAGES.REVIEWS.SYNC_FAILED_UNKNOWN);
    expect(describeSyncFailure(undefined)).toBe(MESSAGES.REVIEWS.SYNC_FAILED_UNKNOWN);
  });
});
