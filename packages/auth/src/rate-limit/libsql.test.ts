import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { type Client, createClient } from '@libsql/client';
import { libsqlStore } from './libsql.js';

let client: Client;
beforeEach(() => {
	client = createClient({ url: ':memory:' });
});
afterEach(() => client.close());

describe('libsqlStore', () => {
	test('counts within a window and keeps the first resetAt', async () => {
		const store = libsqlStore(client, { sweepProbability: 0 });
		const a = await store.incr('k', 60);
		const b = await store.incr('k', 60);
		const c = await store.incr('k', 60);
		expect([a.count, b.count, c.count]).toEqual([1, 2, 3]);
		expect(b.resetAt).toBe(a.resetAt);
		expect(a.resetAt).toBeGreaterThan(Date.now());
	});

	test('keys are independent and reset clears one', async () => {
		const store = libsqlStore(client);
		await store.incr('a', 60);
		await store.incr('a', 60);
		await store.incr('b', 60);
		await store.reset('a');
		expect((await store.incr('a', 60)).count).toBe(1);
		expect((await store.incr('b', 60)).count).toBe(2);
	});

	test('an expired window restarts at 1 with a fresh resetAt', async () => {
		const store = libsqlStore(client, { sweepProbability: 0 });
		await store.incr('k', 60);
		await client.execute({
			sql: 'UPDATE bcms_rate_limit SET count = 9, reset_at = ?',
			args: [Date.now() - 1],
		});
		const hit = await store.incr('k', 60);
		expect(hit.count).toBe(1);
		expect(hit.resetAt).toBeGreaterThan(Date.now());
	});

	test('concurrent increments are not lost', async () => {
		const store = libsqlStore(client);
		const hits = await Promise.all(Array.from({ length: 20 }, () => store.incr('k', 60)));
		expect(hits.map((h) => h.count).sort((x, y) => x - y)).toEqual(
			Array.from({ length: 20 }, (_, i) => i + 1),
		);
	});

	test('creates the table idempotently, across stores sharing a database', async () => {
		const one = libsqlStore(client);
		const two = libsqlStore(client);
		await one.incr('k', 60);
		expect((await two.incr('k', 60)).count).toBe(2);
	});

	test('sweep removes expired rows only', async () => {
		const store = libsqlStore(client, { sweepProbability: 1 });
		await store.incr('old', 60);
		await store.incr('live', 60);
		await client.execute({
			sql: "UPDATE bcms_rate_limit SET reset_at = 1 WHERE key = 'old'",
			args: [],
		});
		await store.incr('live', 60);
		const rows = (await client.execute('SELECT key FROM bcms_rate_limit')).rows;
		expect(rows.map((r) => r.key)).toEqual(['live']);
	});

	test('custom table name is validated', () => {
		expect(() => libsqlStore(client, { table: 'x; DROP TABLE y' })).toThrow(/invalid table/);
		expect(libsqlStore(client, { table: 'my_rl' })).toBeDefined();
	});
});
