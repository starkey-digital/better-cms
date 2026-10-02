import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import { type Client, createClient } from '@libsql/client';
import { RateLimiter, durableObjectStore } from './durable-object.js';
import { libsqlStore } from './libsql.js';
import { lockoutFor } from './lockout.js';
import { memoryStore } from './memory.js';
import type { RateLimitStore } from './types.js';
import { upstashStore } from './upstash.js';

const T0 = new Date('2030-01-01T00:00:00Z').getTime();
beforeEach(() => setSystemTime(new Date(T0)));
afterEach(() => setSystemTime());

/** Just enough Redis (SET PX, PTTL, DEL, the INCR script) behind a fake `fetch`. */
function fakeUpstash(): RateLimitStore {
	const data = new Map<string, { v: number; exp?: number }>();
	const live = (k: string) => {
		const e = data.get(k);
		if (e?.exp !== undefined && e.exp <= Date.now()) data.delete(k);
		return data.get(k);
	};
	const run = ([cmd, ...a]: string[]): unknown => {
		if (cmd === 'SET') {
			data.set(a[0]!, { v: 1, exp: Date.now() + Number(a[3]) });
			return 'OK';
		}
		if (cmd === 'PTTL') {
			const e = live(a[0]!);
			return !e ? -2 : e.exp === undefined ? -1 : e.exp - Date.now();
		}
		if (cmd === 'DEL') return data.delete(a[0]!) ? 1 : 0;
		if (cmd === 'EVAL') {
			const k = a[2]!;
			const e = live(k) ?? { v: 0, exp: Date.now() + Number(a[3]) };
			e.v += 1;
			data.set(k, e);
			return [e.v, e.exp! - Date.now()];
		}
		throw new Error(`unexpected ${cmd}`);
	};
	const realFetch = globalThis.fetch;
	globalThis.fetch = (async (_url: unknown, init: { body: string }) =>
		Response.json(
			(JSON.parse(init.body) as string[][]).map((c) => ({ result: run(c) })),
		)) as unknown as typeof fetch;
	afterEachRestore.push(() => {
		globalThis.fetch = realFetch;
	});
	return upstashStore({ url: 'https://upstash.test', token: 't' });
}
const afterEachRestore: (() => void)[] = [];
afterEach(() => {
	for (const f of afterEachRestore.splice(0)) f();
});

function fakeDurableObject(): RateLimitStore {
	const objects = new Map<string, RateLimiter>();
	return durableObjectStore({
		idFromName: (name) => name,
		get: (id) => {
			let o = objects.get(id as string);
			if (!o) {
				const m = new Map<string, unknown>();
				o = new RateLimiter(
					{
						storage: {
							get: async <T>(k: string) => m.get(k) as T | undefined,
							put: async (k, v) => void m.set(k, v),
							delete: async (k) => void m.delete(k),
						},
					},
					{},
				);
				objects.set(id as string, o);
			}
			const obj = o;
			return { fetch: (input, init) => obj.fetch(new Request(input as string, init)) };
		},
	});
}

let client: Client;
beforeEach(() => {
	client = createClient({ url: ':memory:' });
});
afterEach(() => client.close());

const stores: [string, () => RateLimitStore][] = [
	['memory', () => memoryStore({ silent: true })],
	['libsql', () => libsqlStore(client, { sweepProbability: 0 })],
	['upstash', fakeUpstash],
	['durable-object', fakeDurableObject],
];

describe.each(stores)('%s lockout', (_name, make) => {
	test('a lock outlives the counter window and ends at the ttl', async () => {
		const store = make();
		await store.incr('ip', 60);
		const until = await store.lock?.('ip', 900);
		expect(until).toBe(T0 + 900_000);
		expect(await store.lockedUntil?.('ip')).toBe(T0 + 900_000);

		setSystemTime(new Date(T0 + 61_000));
		expect(await store.lockedUntil?.('ip')).toBe(T0 + 900_000);

		setSystemTime(new Date(T0 + 899_000));
		expect(await store.lockedUntil?.('ip')).not.toBeNull();

		setSystemTime(new Date(T0 + 900_001));
		expect(await store.lockedUntil?.('ip')).toBeNull();
	});

	test('locks are per key and not cleared by resetting the counter', async () => {
		const store = make();
		await store.lock?.('a', 60);
		expect(await store.lockedUntil?.('b')).toBeNull();
		await store.reset('a');
		expect(await store.lockedUntil?.('a')).not.toBeNull();
	});

	test('an unlocked key reports null and counters are unaffected by locks', async () => {
		const store = make();
		expect(await store.lockedUntil?.('k')).toBeNull();
		await store.lock?.('k', 60);
		expect((await store.incr('k', 60)).count).toBe(1);
	});
});

describe('lockoutFor', () => {
	test('uses the store implementation when present', async () => {
		const store = memoryStore({ silent: true });
		await lockoutFor(store).lock('k', 60);
		expect(await store.lockedUntil?.('k')).toBe(T0 + 60_000);
	});

	test('falls back to a working per-process lockout for stores without lock support', async () => {
		const bare: RateLimitStore = {
			incr: async () => ({ count: 1, resetAt: 0 }),
			reset: async () => {},
		};
		const lockout = lockoutFor(bare);
		expect(await lockout.lockedUntil('k')).toBeNull();
		await lockout.lock('k', 60);
		expect(await lockout.lockedUntil('k')).toBe(T0 + 60_000);
		setSystemTime(new Date(T0 + 61_000));
		expect(await lockout.lockedUntil('k')).toBeNull();
	});
});
