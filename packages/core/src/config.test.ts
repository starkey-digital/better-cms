import { describe, expect, test } from 'bun:test';
import { clientCmsConfig } from './config.js';

describe('clientCmsConfig', () => {
	test('returns only collections + basePath', () => {
		const result = clientCmsConfig({
			collections: { posts: { kind: 'collection', fields: {} } } as never,
			basePath: '/cms-api',
		});
		expect(result).toEqual({
			collections: { posts: { kind: 'collection', fields: {} } },
			basePath: '/cms-api',
		});
	});

	test('omits basePath when not set', () => {
		const result = clientCmsConfig({
			collections: { posts: { kind: 'collection', fields: {} } } as never,
		});
		expect(result.basePath).toBeUndefined();
	});

	test('strips schemas, validation, access, hooks, toJsonSchema, __schema from each collection', () => {
		const schema = {
			'~standard': { version: 1 as const, vendor: 'test', validate: () => ({ value: {} }) },
		};
		const col = {
			kind: 'collection' as const,
			fields: {},
			schemas: { create: schema, update: schema, full: schema },
			validation: { create: schema },
			access: { read: async () => true },
			hooks: { beforeCreate: async () => {} },
			toJsonSchema: () => ({}),
			__schema: schema,
		} as never;
		const result = clientCmsConfig({ collections: { posts: col } });
		const stripped = result.collections.posts as Record<string, unknown>;
		expect('schemas' in stripped).toBe(false);
		expect('validation' in stripped).toBe(false);
		expect('access' in stripped).toBe(false);
		expect('hooks' in stripped).toBe(false);
		expect('toJsonSchema' in stripped).toBe(false);
		expect('__schema' in stripped).toBe(false);
		expect(stripped.kind).toBe('collection');
		expect(stripped.fields).toEqual({});
	});
});
