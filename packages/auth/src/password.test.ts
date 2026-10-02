import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import type { CmsContext } from '@better-cms/core';
import { passwordAuth } from './password.js';
import { memoryStore } from './rate-limit/memory.js';
import type { RateLimitStore } from './rate-limit/types.js';

const T0 = new Date('2030-01-01T00:00:00Z').getTime();
beforeEach(() => setSystemTime(new Date(T0)));
afterEach(() => setSystemTime());

function login(auth: ReturnType<typeof passwordAuth>, password: string) {
	const endpoint = auth.endpoints?.find((e) => e.path === '/login');
	return endpoint!.handler(
		new Request('http://x/login', {
			method: 'POST',
			headers: { 'x-forwarded-for': '1.2.3.4' },
			body: JSON.stringify({ password }),
		}),
		{} as CmsContext,
	) as Promise<Response>;
}

const make = (store: RateLimitStore, lockoutMinutes = 15) =>
	passwordAuth({
		password: 'correct-horse',
		secret: 'x'.repeat(32),
		rateLimit: { store, perIp: { window: '1m', max: 1 }, lockoutMinutes },
	});

// Covers the memory store plus a store that predates lock()/lockedUntil().
const stores: [string, () => RateLimitStore][] = [
	['memory store', () => memoryStore({ silent: true })],
	[
		'store without lock support',
		() => {
			const inner = memoryStore({ silent: true });
			return { incr: inner.incr, reset: inner.reset };
		},
	],
];

describe.each(stores)('login lockout (%s)', (_n, makeStore) => {
	test('stays locked for lockoutMinutes, past the 1m counter window', async () => {
		const auth = make(makeStore());
		expect((await login(auth, 'wrong')).status).toBe(401);

		const tripped = await login(auth, 'wrong');
		expect(tripped.status).toBe(429);
		expect(tripped.headers.get('retry-after')).toBe('900');

		setSystemTime(new Date(T0 + 61_000));
		const stillLocked = await login(auth, 'correct-horse');
		expect(stillLocked.status).toBe(429);
		expect(stillLocked.headers.get('retry-after')).toBe('839');

		setSystemTime(new Date(T0 + 14 * 60_000));
		expect((await login(auth, 'correct-horse')).status).toBe(429);
	});

	test('lets the caller back in once the lockout has elapsed', async () => {
		const auth = make(makeStore());
		await login(auth, 'wrong');
		await login(auth, 'wrong');

		setSystemTime(new Date(T0 + 15 * 60_000 + 1000));
		expect((await login(auth, 'correct-horse')).status).toBe(200);
	});

	test('lockoutMinutes: 0 disables the lockout, leaving only the counter window', async () => {
		const auth = make(makeStore(), 0);
		await login(auth, 'wrong');
		const tripped = await login(auth, 'wrong');
		expect(tripped.status).toBe(429);
		expect(Number(tripped.headers.get('retry-after'))).toBeLessThanOrEqual(60);

		setSystemTime(new Date(T0 + 61_000));
		expect((await login(auth, 'correct-horse')).status).toBe(200);
	});
});
