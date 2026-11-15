export interface CacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface Entry {
  readonly value: unknown;
  readonly expiresAt: number;
}

export class MemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();

  public async get<T>(key: string): Promise<T | null> {
    const entry = this.entries.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlSeconds) * 1000
    });
  }

  public async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

export function cacheKey(...parts: string[]): string {
  return parts
    .map((part) => part.toLowerCase().trim().replace(/\s+/g, ' '))
    .join(':');
}

/** Stored value for negative cache entries. Not a valid domain payload. */
export const CACHE_MISS = { miss: true } as const;
export type CacheMiss = typeof CACHE_MISS;

export function isCacheMiss(value: unknown): value is CacheMiss {
  return Boolean(value && typeof value === 'object' && 'miss' in value && (value as CacheMiss).miss === true);
}

export interface CachedLookupOptions<T> {
  readonly key: string;
  readonly hitTtlSeconds: number;
  /** When set, null loads are remembered so expensive cascades are not re-fired. */
  readonly missTtlSeconds?: number;
  readonly load: () => Promise<T | null>;
}

/**
 * Deep helper over CacheStore: hit / miss / negative-miss policy in one place.
 * Callers supply only the key, TTLs, and the load body.
 */
export async function cachedLookup<T>(cache: CacheStore, options: CachedLookupOptions<T>): Promise<T | null> {
  const cached = await cache.get<T | CacheMiss>(options.key);
  if (cached !== null) {
    if (isCacheMiss(cached)) return null;
    return cached;
  }

  const value = await options.load();
  if (value === null) {
    if (options.missTtlSeconds) {
      await cache.set(options.key, CACHE_MISS, options.missTtlSeconds);
    }
    return null;
  }

  await cache.set(options.key, value, options.hitTtlSeconds);
  return value;
}
