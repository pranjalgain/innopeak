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

  // A 0 would pass TypeScript, then fail `reviews_rating_check` deep in a batch insert, and read as a 0-star review that trips every escalation rule.
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
