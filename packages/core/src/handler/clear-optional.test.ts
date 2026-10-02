import { describe, expect, test } from 'bun:test';
import type { CmsConfig } from '../config.js';
import { _collection } from '../dsl/collection.js';
import type { ContentStore, Row } from '../store/content.js';
import { createCMS } from './handler.js';

// Optional, like zod `.optional()`: accepts undefined, rejects null.
const optionalOnly = {
	'~standard': {
		version: 1,
		vendor: 'test',
		validate: (v: any) =>
			v.cover === null
				? { issues: [{ message: 'expected object, received null', path: ['cover'] }] }
				: { value: v },
	},
} as any;

describe('clearing an optional field', () => {
	test('null from the admin is treated as "no value" and clears the column', async () => {
		let written: Row | undefined;
		const store = {
			async init() {},
			async create(_c: string, d: Row) {
				return d;
			},
			async update(_c: string, _w: unknown, d: Row) {
				written = d;
				return d;
			},
			async findOne() {
				return { id: '1', cover: '{"key":"k","url":"u"}' };
			},
			async findMany() {
				return [];
			},
			async delete() {
				return 0;
			},
			async count() {
				return 0;
			},
		} as unknown as ContentStore;
		const posts = _collection({
			kind: 'collection',
			fields: { cover: { kind: 'image', storage: 'json', columnType: 'text', required: false } },
			validation: { create: optionalOnly, update: optionalOnly, full: optionalOnly },
			access: { read: () => true, update: () => true },
		} as any);
		const cms = await createCMS({ collections: { posts }, adapter: store } as unknown as CmsConfig<
			any,
			any
		>);

		const res = await cms.handler(
			new Request('http://x/api/cms/ops', {
				method: 'POST',
				body: JSON.stringify({
					ops: [{ op: 'set', collection: 'posts', id: '1', data: { cover: null } }],
				}),
				headers: { 'content-type': 'application/json' },
			}),
		);
		const body = await res.json();
		expect(body.results[0].error ?? null).toBeNull();
		expect(written).toBeDefined();
		expect(written!.cover).toBeNull();
	});
});
