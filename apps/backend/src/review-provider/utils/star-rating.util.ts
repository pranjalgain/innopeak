import { ProviderMappingError } from '../errors/provider.error';
import type { GbpStarRating } from '../types/gbp-wire.type';

/**
 * Google sends ratings as English words, not integers. This is the single most likely place for a
 * silent data bug in the whole ingestion path, because the obvious wrong implementations both
 * "work": `Number(starRating)` yields `NaN`, and a lookup with a `?? 0` fallback yields 0 — and 0
 * is not a rating, it is the value that makes every escalation rule ("rating <= 2") fire on every
 * review Google described in a way we didn't expect.
 */
const STAR_RATING_TO_INT: Readonly<Record<GbpStarRating, number>> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

/**
 * Throws rather than defaulting, on both an unknown word and `STAR_RATING_UNSPECIFIED`.
 *
 * `reviews_rating_check` is `CHECK (rating BETWEEN 1 AND 5)`, so a 0 would be rejected by Postgres
 * anyway — but as a mid-batch constraint violation that fails the whole sync run with a message
 * about a check constraint, tens of thousands of reviews away from the enum value that caused it.
 * Failing here names the actual value.
 */
export function starRatingToInt(starRating: string): number {
  // Indexed as a plain record, not through GbpStarRating: the input is whatever Google sent, and
  // asserting it into the union would make the `undefined` check below look dead to the compiler
  // while doing nothing at runtime — which is precisely the bug this function exists to catch.
  const rating: number | undefined = (STAR_RATING_TO_INT as Record<string, number | undefined>)[
    starRating
  ];

  if (rating === undefined) {
    throw new ProviderMappingError(`Unknown Google star rating: ${starRating}`);
  }

  if (rating === 0) {
    throw new ProviderMappingError(
      `Google returned an unspecified star rating; a review has no usable rating value`
    );
  }

  return rating;
}
