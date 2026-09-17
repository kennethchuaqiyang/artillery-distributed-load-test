import Redis from "ioredis";

// Falls back to an in-memory Map if Redis isn't running locally, so you
// can still run the API without Docker. Swap USE_REAL_REDIS=true once
// you've got `docker run -p 6379:6379 redis` up, to practice against
// the real thing (TTL expiry, cache invalidation bugs, etc.)
const USE_REAL_REDIS = process.env.USE_REAL_REDIS === "true";

interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

class InMemoryCache implements CacheClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string) {
    this.store.delete(key);
  }
}

class RealRedisCache implements CacheClient {
  private client = new Redis();

  async get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number) {
    await this.client.set(key, value, "EX", ttlSeconds);
  }

  async del(key: string) {
    await this.client.del(key);
  }
}

export const cache: CacheClient = USE_REAL_REDIS
  ? new RealRedisCache()
  : new InMemoryCache();

export const CACHE_MODE = USE_REAL_REDIS ? "redis" : "in-memory (fallback)";
