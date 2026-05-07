import { describe, expect, test } from 'bun:test';
import type { AdapterContext, AdapterFactory } from './config.js';

const ctx: AdapterContext = { env: { DATABASE_URL: 'file:./test.db' } };

describe('AdapterFactory', () => {
	test('synchronous factory yields the constructed adapter', async () => {
		const factory: AdapterFactory<{ url?: string }> = (c) => ({ url: c.env.DATABASE_URL });
		expect(await factory(ctx)).toEqual({ url: 'file:./test.db' });
	});

	test('async factory is awaited', async () => {
		const factory: AdapterFactory<{ url?: string; async: boolean }> = async (c) => ({
			url: c.env.DATABASE_URL,
			async: true,
		});
		expect(await factory(ctx)).toEqual({ url: 'file:./test.db', async: true });
	});

	test('factory sees an empty env when context env is empty', async () => {
		const factory: AdapterFactory<string[]> = (c) => Object.keys(c.env);
		expect(await factory({ env: {} })).toEqual([]);
	});
});
