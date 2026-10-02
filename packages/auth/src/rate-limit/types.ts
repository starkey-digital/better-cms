export interface RateLimitHit {
	count: number;
	resetAt: number;
}

export interface RateLimitStore {
	incr(key: string, windowSec: number): Promise<RateLimitHit>;
	reset(key: string): Promise<void>;
	/**
	 * Optional. Locks `key` for `ttlSec` regardless of its counter window, and
	 * returns when the lock ends (ms since epoch). Used for `lockoutMinutes`.
	 * Stores without `lock`/`lockedUntil` fall back to a per-process lockout.
	 */
	lock?(key: string, ttlSec: number): Promise<number>;
	/** Optional. When `key`'s lock ends (ms since epoch), or `null` if it isn't locked. */
	lockedUntil?(key: string): Promise<number | null>;
}
