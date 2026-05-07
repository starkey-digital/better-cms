import type { RateLimitHit, RateLimitStore } from './types.js';

export interface MemoryStoreOpts {
	silent?: boolean;
	force?: boolean;
}

let warned = false;

function isCloudflareWorkers(): boolean {
	const g = globalThis as unknown as {
		WebSocketPair?: unknown;
		navigator?: { userAgent?: string };
		caches?: { default?: unknown };
	};
	if (typeof g.WebSocketPair === 'function') return true;
	if (g.navigator?.userAgent === 'Cloudflare-Workers') return true;
	if (g.caches && typeof g.caches === 'object' && 'default' in g.caches) return true;
	return false;
}

export function memoryStore(opts: MemoryStoreOpts = {}): RateLimitStore {
	if (!opts.force && isCloudflareWorkers()) {
		throw new Error(
			'[better-cms] memoryStore() detected Cloudflare Workers runtime. In-memory state does not work across isolates — use durableObjectStore() or upstashStore(). Pass { force: true } to override (testing only).',
		);
	}
	if (!opts.silent && !warned) {
		warned = true;
		console.warn(
			'[better-cms] passwordAuth using in-memory rate limit. Resets on restart, breaks across instances. Use durableObjectStore() or upstashStore() in production.',
		);
	}
	const map = new Map<string, RateLimitHit>();

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
	};
}
