/** Google answered 404 for the review while its location is still reachable: the review's author deleted it. */
export class ReviewRemovedUpstreamError extends Error {}

/** Google answered 404 for the review and can't find its location either, so the 404 says nothing about the review. */
export class LocationUnavailableError extends Error {}
