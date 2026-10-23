/** After this many failed drafting attempts a review is left for the owner to answer by hand; new review text from Google resets the count. */
export const GENERATION_MAX_ATTEMPTS = 5;

/** A review that failed is not tried again for `attempts * this` minutes, so it cannot occupy the head of every tick's batch. */
export const GENERATION_RETRY_BACKOFF_MINUTES = 15;
