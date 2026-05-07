import { describe, expect, test } from 'bun:test';
import { clientCMSConfig } from './config.js';

describe('clientCMSConfig', () => {
	test('returns only collections + basePath (no adapter, media, auth)', () => {
		const fakeAdapter = { findMany: async () => [] } as never;
		const fakeMedia = { put: async () => {} } as never;
		const result = clientCMSConfig({
			collections: { posts: { kind: 'collection', fields: {} } } as never,
			adapter: fakeAdapter,
			media: fakeMedia,
			auth: { getUser: async () => null },
			basePath: '/cms-api',
		});
		expect(result).toEqual({
			collections: { posts: { kind: 'collection', fields: {} } } as never,
			basePath: '/cms-api',
		});
		expect('adapter' in result).toBe(false);
		expect('media' in result).toBe(false);
		expect('auth' in result).toBe(false);
	});

	test('omits basePath when not set', () => {
		const result = clientCMSConfig({
			collections: { posts: { kind: 'collection', fields: {} } } as never,
			adapter: {} as never,
		});
		expect(result.basePath).toBeUndefined();
	});
});
