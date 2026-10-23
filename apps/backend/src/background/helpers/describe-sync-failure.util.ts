import { MESSAGES } from '@common/constants/messages.constants';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  ProviderUnavailableError,
} from '@review-provider/errors/provider.error';

/**
 * What a failed sync records on its run, which the owner reads as the location's "last sync error". Our own wording, in the owner's language:
 * the raw text is a provider's English (up to 500 characters of Google's response) or, for a database failure, SQL and bound values. The raw
 * message is logged where the failure is caught.
 */
export function describeSyncFailure(error: unknown): string {
  if (error instanceof ProviderAuthError) {
    return MESSAGES.REVIEWS.SYNC_FAILED_AUTH;
  }
  if (error instanceof ProviderRateLimitError) {
    return MESSAGES.REVIEWS.SYNC_FAILED_RATE_LIMITED;
  }
  if (error instanceof ProviderUnavailableError) {
    return MESSAGES.REVIEWS.SYNC_FAILED_UNAVAILABLE;
  }
  return MESSAGES.REVIEWS.SYNC_FAILED_UNKNOWN;
}
