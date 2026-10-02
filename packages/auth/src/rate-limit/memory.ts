import type { RateLimitHit, RateLimitStore } from './types.js';

export interface MemoryStoreOpts {
	silent?: boolean;
	/** @deprecated No longer needed — `memoryStore()` no longer refuses to run on Workers. */
	force?: boolean;
}

function isCloudflareWorkers(): boolean {
	return (
		(globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ===
		'Cloudflare-Workers'
	);
}

/**
 * Per-process counters. On Workers each isolate has its own map, so this is
 * best-effort throttling only (an attacker spread across isolates gets
 * `max` attempts per isolate). Use `libsqlStore()` there.
 */
export function memoryStore(opts: MemoryStoreOpts = {}): RateLimitStore {
	if (!opts.silent) {
		console.warn(
			isCloudflareWorkers()
				? '[better-cms] passwordAuth using in-memory rate limit on Cloudflare Workers: counters are per-isolate, so limits are best-effort only. Use libsqlStore(client) for a shared limit.'
				: '[better-cms] passwordAuth using in-memory rate limit. Resets on restart, breaks across instances. Use libsqlStore(), durableObjectStore() or upstashStore() in production.',
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
