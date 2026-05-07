import type { RateLimitHit, RateLimitStore } from './types.js';

interface DurableObjectStub {
	fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespaceLike {
	idFromName(name: string): unknown;
	get(id: unknown): DurableObjectStub;
}

interface DurableObjectStateLike {
	storage: {
		get<T>(key: string): Promise<T | undefined>;
		put<T>(key: string, value: T): Promise<void>;
		delete(key: string): Promise<void>;
		setAlarm?(scheduledTime: number | Date): Promise<void>;
	};
	blockConcurrencyWhile?<T>(fn: () => Promise<T>): Promise<T>;
}

export function durableObjectStore(namespace: DurableObjectNamespaceLike): RateLimitStore {
	return {
		async incr(key, windowSec) {
			const stub = namespace.get(namespace.idFromName(key));
			const res = await stub.fetch('https://rl/incr', {
				method: 'POST',
				body: JSON.stringify({ windowSec }),
			});
			return (await res.json()) as RateLimitHit;
		},
		async reset(key) {
			const stub = namespace.get(namespace.idFromName(key));
			await stub.fetch('https://rl/reset', { method: 'POST' });
		},
	};
}

/**
 * Durable Object class for rate-limit counters.
 * Bind in wrangler.toml:
 *
 *   [[durable_objects.bindings]]
 *   name = "CMS_RATE_LIMIT"
 *   class_name = "RateLimiter"
 *
 *   [[migrations]]
 *   tag = "v1"
 *   new_sqlite_classes = ["RateLimiter"]
 *
 * Then export from your Worker entry:
 *
 *   export { RateLimiter } from 'better-cms/sveltekit/auth';
 */
export class RateLimiter {
	private state: DurableObjectStateLike;

	constructor(state: DurableObjectStateLike, _env: unknown) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === '/incr' && request.method === 'POST') {
			const { windowSec } = (await request.json()) as { windowSec: number };
			const now = Date.now();
			const run = async (): Promise<RateLimitHit> => {
				const current = await this.state.storage.get<RateLimitHit>('hit');
				if (current && current.resetAt > now) {
					current.count += 1;
					await this.state.storage.put('hit', current);
					return current;
				}
				const hit: RateLimitHit = { count: 1, resetAt: now + windowSec * 1000 };
				await this.state.storage.put('hit', hit);
				return hit;
			};
			const hit = this.state.blockConcurrencyWhile
				? await this.state.blockConcurrencyWhile(run)
				: await run();
			return Response.json(hit);
		}
		if (url.pathname === '/reset' && request.method === 'POST') {
			await this.state.storage.delete('hit');
			return new Response(null, { status: 204 });
		}
		return new Response('Not found', { status: 404 });
	}
}
