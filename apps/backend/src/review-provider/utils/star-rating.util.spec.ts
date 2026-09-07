import { starRatingToInt } from './star-rating.util';

import { ProviderMappingError } from '../errors/provider.error';

describe('starRatingToInt', () => {
  it.each([
    ['ONE', 1],
    ['TWO', 2],
    ['THREE', 3],
    ['FOUR', 4],
    ['FIVE', 5],
  ])('maps %s to %i', (word, expected) => {
    expect(starRatingToInt(word)).toBe(expected);
  });

  // The whole reason this function throws instead of returning a number: 0 satisfies TypeScript,
  // fails `reviews_rating_check` deep inside a batch insert, and until then reads as a 0-star
  // review that every escalation rule fires on.
  it('throws on STAR_RATING_UNSPECIFIED rather than returning 0', () => {
    expect(() => starRatingToInt('STAR_RATING_UNSPECIFIED')).toThrow(ProviderMappingError);
  });

  it('throws on a rating word Google has not sent before', () => {
    expect(() => starRatingToInt('SIX')).toThrow(ProviderMappingError);
    expect(() => starRatingToInt('')).toThrow(ProviderMappingError);
  });

  it('names the offending value in the message', () => {
    expect(() => starRatingToInt('SEVEN')).toThrow(/SEVEN/);
  });
});
