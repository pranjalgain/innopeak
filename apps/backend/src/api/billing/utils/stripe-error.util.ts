/** Stripe's "no such object": the customer or subscription was deleted, or the id never existed in Stripe. */
export function isResourceMissing(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'resource_missing';
}
