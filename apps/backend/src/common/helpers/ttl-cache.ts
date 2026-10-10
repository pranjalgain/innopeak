/**
 * A small in-process cache for expensive reads whose staleness is harmless (platform-wide admin aggregates). Not shared
 * between instances, so a value can be up to `ttlMs` old on any of them, and never older.
 *
 * Concurrent misses for one key share a single load rather than each hitting the database, and a failed load is never
 * cached: the next call tries again.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expiresAt: number }>();
  private readonly loading = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 50,
    private readonly now: () => number = Date.now
  ) {}

  async getOrLoad(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit !== undefined && hit.expiresAt > this.now()) {
      return hit.value;
    }

    const inFlight = this.loading.get(key);
    if (inFlight !== undefined) {
      return inFlight;
    }

    const pending = load()
      .then(value => {
        this.store(key, value);
        return value;
      })
      .finally(() => {
        this.loading.delete(key);
      });
    this.loading.set(key, pending);
    return pending;
  }

  clear(): void {
    this.entries.clear();
  }

  private store(key: string, value: V): void {
    if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
      // Oldest first: a Map iterates in insertion order. The key space is tiny here (a few month windows).
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}
