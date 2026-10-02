import type { RateLimitHit, RateLimitStore } from './types.js';

export interface MemoryStoreOpts {
	silent?: boolean;
	/** Allow in-memory counters on Cloudflare Workers, where each isolate gets its own. Testing only. */
	force?: boolean;
}

/** Any one of these markers is enough; the `navigator.userAgent` sniff alone is not reliable across compat flags. */
export function isCloudflareWorkers(): boolean {
	const g = globalThis as unknown as {
		WebSocketPair?: unknown;
		navigator?: { userAgent?: string };
		caches?: { default?: unknown };
	};
	if (typeof g.WebSocketPair === 'function') return true;
	if (g.navigator?.userAgent === 'Cloudflare-Workers') return true;
	return Boolean(g.caches && typeof g.caches === 'object' && 'default' in g.caches);
}

export const WORKERS_MEMORY_STORE_ERROR =
	'[better-cms] in-memory rate limiting cannot work on Cloudflare Workers: every isolate has its own counters, so lockouts and limits are trivially bypassed. Pass a shared store, e.g. passwordAuth({ rateLimit: { store: libsqlStore(client) } }) (or durableObjectStore() / upstashStore()). memoryStore({ force: true }) overrides this for testing only.';

/**
 * Per-process counters. Resets on restart and is not shared across instances,
 * so it is for development and single-process servers. Refuses to run on
 * Workers unless `force` is set.
 */
export function memoryStore(opts: MemoryStoreOpts = {}): RateLimitStore {
	const onWorkers = isCloudflareWorkers();
	if (onWorkers && !opts.force) throw new Error(WORKERS_MEMORY_STORE_ERROR);
	if (!opts.silent) {
		console.warn(
			onWorkers
				? '[better-cms] memoryStore({ force: true }) on Cloudflare Workers: counters are per-isolate, so limits are best-effort only.'
				: '[better-cms] passwordAuth using in-memory rate limit. Resets on restart, breaks across instances. Use libsqlStore(), durableObjectStore() or upstashStore() in production.',
		);
	}
	const map = new Map<string, RateLimitHit>();
	const locks = new Map<string, number>();

	function sweep(now: number): void {
		for (const [k, v] of map) if (v.resetAt <= now) map.delete(k);
	}

	return {
		async incr(key, windowSec) {
			const now = Date.now();
			sweep(now);
			const existing = map.get(key);
			if (existing && existing.resetAt > now) {
				existing.count += 1;
				return existing;
			}
			const hit: RateLimitHit = { count: 1, resetAt: now + windowSec * 1000 };
			map.set(key, hit);
			return hit;
		},
		async reset(key) {
			map.delete(key);
		},
		async lock(key, ttlSec) {
			const until = Date.now() + ttlSec * 1000;
			locks.set(key, until);
			return until;
		},
		async lockedUntil(key) {
			const until = locks.get(key);
			if (until === undefined) return null;
			if (until <= Date.now()) {
				locks.delete(key);
				return null;
			}
			return until;
		},
	};
}
