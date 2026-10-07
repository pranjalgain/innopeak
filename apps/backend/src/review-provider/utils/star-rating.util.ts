import { ProviderMappingError } from '../errors/provider.error';
import type { GbpStarRating } from '../types/gbp-wire.type';

// Google sends ratings as words. Wrong approaches silently "work": `Number()` gives NaN and a
// `?? 0` fallback gives 0, which trips every "rating <= 2" escalation rule.
const STAR_RATING_TO_INT: Readonly<Record<GbpStarRating, number>> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

/** Throws on unknown words and `STAR_RATING_UNSPECIFIED`: Postgres would reject 0 only as an opaque mid-batch constraint failure. */
export function starRatingToInt(starRating: string): number {
  // Plain record, not `GbpStarRating`: the input is whatever Google sent, and narrowing would make the `undefined` check look dead.
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
