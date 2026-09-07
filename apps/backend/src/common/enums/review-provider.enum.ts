/** `review_provider` — a single value today, kept as an enum rather than a literal so a second
 * provider (Yelp, Trustpilot) has an obvious place to be added. */
export enum ReviewProvider {
  GOOGLE = 'google',
}
