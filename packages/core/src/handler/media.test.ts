import { beforeEach, describe, expect, test } from 'bun:test';
import type { CmsConfig } from '../config.js';
import { _collection } from '../dsl/collection.js';
import type { ContentStore, Row } from '../store/content.js';
import type { MediaObject, MediaStore } from '../store/media.js';
import { createCMS } from './handler.js';

/** Minimal in-memory store. `failOn` lets a test make one collection's insert blow up. */
function memoryStore(failOn?: string): ContentStore & { rows: Map<string, Row[]> } {
	const rows = new Map<string, Row[]>();
	return {
		rows,
		async init() {},
		async create(collection, data) {
			if (collection === failOn) throw new Error('database is down');
			const list = rows.get(collection) ?? [];
			list.push(data);
			rows.set(collection, list);
			return data;
		},
		async update(_c, _w, data) {
			return data;
		},
		async delete() {
			return 0;
		},
		async findOne() {
			return null;
		},
		async findMany() {
			return [];
		},
		async count() {
			return 0;
		},
	};
}

function mediaStore(): MediaStore & { put_: string[]; deleted: string[] } {
	const state = { put_: [] as string[], deleted: [] as string[] };
	return {
		...state,
		async put(): Promise<MediaObject> {
			const key = `uploads/${state.put_.length}.bin`;
			state.put_.push(key);
			return { key, url: `https://cdn.test/${key}`, mime: 'image/png', size: 3 };
		},
		async delete(key: string) {
			state.deleted.push(key);
		},
	} as MediaStore & { put_: string[]; deleted: string[] };
}

const posts = _collection({ kind: 'collection', fields: {} });

function upload(file = new Blob(['abc'], { type: 'image/png' }), name = 'a.png'): Request {
	const form = new FormData();
	form.append('file', file, name);
	return new Request('http://x/api/cms/media', { method: 'POST', body: form });
}

async function build(overrides: Partial<CmsConfig<any, any>>, store = memoryStore()) {
	return createCMS({
		collections: { posts },
		adapter: store,
		media: mediaStore(),
		...overrides,
	} as unknown as CmsConfig<any, any>);
}

describe('POST /media authorization', () => {
	test('denies uploads when no media policy is configured', async () => {
		const cms = await build({ access: { create: () => true } });
		const res = await cms.handler(upload());
		expect(res.status).toBe(403);
	});

	test('a publicly-writable collection does not confer upload rights', async () => {
		// A public comments/contact-form collection must not turn the asset
		// bucket into anonymous file hosting.
		const cms = await build({
			collections: {
				comments: _collection({ kind: 'collection', fields: {}, access: { create: () => true } }),
			},
			access: { create: () => false },
		});
		expect((await cms.handler(upload())).status).toBe(403);
	});

	test('allows an upload the media policy permits', async () => {
		const cms = await build({ mediaAccess: { upload: () => true } });
		const res = await cms.handler(upload());
		expect(res.status).toBe(200);
		expect((await res.json()).key).toBe('uploads/0.bin');
	});

	test('passes the auth context to the media policy', async () => {
		let seen: unknown = 'not called';
		const cms = await build({
			auth: { context: async () => ({ role: 'editor' }) },
			mediaAccess: {
				upload: (ctx) => {
					seen = ctx;
					return (ctx as { role: string }).role === 'editor';
				},
			},
		});
		expect((await cms.handler(upload())).status).toBe(200);
		expect(seen).toEqual({ role: 'editor' });
	});
});

describe('POST /media limits', () => {
	test('rejects a body over the default size ceiling', async () => {
		const cms = await build({ mediaAccess: { upload: () => true } });
		const big = new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' });
		const res = await cms.handler(upload(big));
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain('limit');
	});

	test('honours an explicit size ceiling', async () => {
		const cms = await build({ mediaAccess: { upload: () => true, maxBytes: 2 } });
		expect((await cms.handler(upload())).status).toBe(400);
	});

	test('rejects a mime type outside the accepted set', async () => {
		const cms = await build({ mediaAccess: { upload: () => true } });
		const res = await cms.handler(upload(new Blob(['#!/bin/sh'], { type: 'text/x-sh' }), 'x.sh'));
		expect(res.status).toBe(400);
		expect((await res.json()).error.message).toContain('mime type');
	});

	test('matches wildcard mime patterns', async () => {
		const cms = await build({ mediaAccess: { upload: () => true, mimeTypes: ['text/*'] } });
		const res = await cms.handler(upload(new Blob(['hi'], { type: 'text/plain' }), 'a.txt'));
		expect(res.status).toBe(200);
	});

	test('an empty mimeTypes list accepts anything', async () => {
		const cms = await build({ mediaAccess: { upload: () => true, mimeTypes: [] } });
		const res = await cms.handler(upload(new Blob(['#!/bin/sh'], { type: 'text/x-sh' }), 'x.sh'));
		expect(res.status).toBe(200);
	});
});

describe('POST /media failure handling', () => {
	test('deletes the uploaded object when its metadata insert fails', async () => {
		// The blob is durable before the row that makes it discoverable is.
		// Leaving it behind means a billed object nothing references, and a
		// retry would add another one each attempt.
		const store = memoryStore('cms_media');
		const cms = await build({ mediaAccess: { upload: () => true } }, store);
		const media = cms.context.media as unknown as { deleted: string[] };

		const res = await cms.handler(upload());
		expect(res.status).toBe(500);
		expect(media.deleted).toEqual(['uploads/0.bin']);
	});

	test('keeps the object when the metadata insert succeeds', async () => {
		const cms = await build({ mediaAccess: { upload: () => true } });
		const media = cms.context.media as unknown as { deleted: string[] };
		expect((await cms.handler(upload())).status).toBe(200);
		expect(media.deleted).toEqual([]);
	});
});
