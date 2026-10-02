import { isCloudflareWorkers, memoryStore } from './memory.js';
import type { RateLimitStore } from './types.js';

export interface Lockout {
	lock(key: string, ttlSec: number): Promise<number>;
	lockedUntil(key: string): Promise<number | null>;
}

/**
 * The store's own lockout, or a per-process one when it doesn't implement `lock`/`lockedUntil`.
 * On Workers that fallback is per-isolate, so it warns rather than refusing a shared store.
 */
export function lockoutFor(store: RateLimitStore): Lockout {
	const { lock, lockedUntil } = store;
	if (lock && lockedUntil) return { lock: lock.bind(store), lockedUntil: lockedUntil.bind(store) };
	const local = memoryStore({ force: true, silent: !isCloudflareWorkers() });
	return {
		lock: local.lock as Lockout['lock'],
		lockedUntil: local.lockedUntil as Lockout['lockedUntil'],
	};
}
