import { describe, expect, test } from 'bun:test';
import type { CmsConfig } from '../config.js';
import type { ContentStore, FindManyQuery, Row, WhereClause } from '../store/content.js';
import type { MediaObject, MediaStore } from '../store/media.js';
import { createCMS } from './handler.js';

const matches = (row: Row, where?: WhereClause) =>
	Object.entries(where ?? {}).every(([k, v]) => row[k] === v);

function store(failCreate = false): ContentStore & { rows: Row[] } {
	const rows: Row[] = [];
	return {
		rows,
		async init() {},
		async create(_c, data) {
			if (failCreate) throw new Error('db down');
			rows.push(data);
			return data;
		},
		async update(_c, _w, d) {
			return d;
		},
		async delete(_c, where) {
			const before = rows.length;
			for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i]!, where)) rows.splice(i, 1);
			return before - rows.length;
		},
		async findOne(_c, where) {
			return rows.find((r) => matches(r, where)) ?? null;
		},
		async findMany(_c, q: FindManyQuery = {}) {
			let out = rows.filter((r) => matches(r, q.where));
			const o = q.orderBy?.[0];
			if (o) {
				const dir = o.dir === 'desc' ? -1 : 1;
				out = [...out].sort((a, b) => ((a[o.field] as number) - (b[o.field] as number)) * dir);
			}
			return out.slice(q.offset ?? 0, (q.offset ?? 0) + (q.limit ?? out.length));
		},
		async count() {
			return rows.length;
		},
	};
}

function blobs() {
	const state = { put: [] as string[], deleted: [] as string[] };
	const media: MediaStore = {
		async put(_b, opts): Promise<MediaObject> {
			state.put.push(opts!.key!);
			return { key: opts!.key!, url: `https://cdn.test/${opts!.key}`, mime: opts!.mime!, size: 3 };
		},
		async delete(key) {
			state.deleted.push(key);
		},
	};
	return { media, ...state, state };
}

async function build(over: Partial<CmsConfig<any, any>> = {}, s = store(), b = blobs()) {
	const cms = await createCMS({
		collections: {},
		adapter: s,
		media: b.media,
		mediaAccess: { upload: () => true, delete: () => true },
		...over,
	} as unknown as CmsConfig<any, any>);
	return { cms, s, b };
}

// A 1x1-ish PNG header padded to 64 bytes, claiming 640x480.
function png(extra = 0): Blob {
	const h = new Uint8Array(64 + extra);
	h.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10], 0);
	new DataView(h.buffer).setUint32(16, 640);
	new DataView(h.buffer).setUint32(20, 480);
	return new Blob([h], { type: 'image/png' });
}

const upload = (file: Blob, alt?: string) => {
	const f = new FormData();
	f.append('file', file, 'a.png');
	if (alt !== undefined) f.append('alt', alt);
	return new Request('http://x/api/cms/media', { method: 'POST', body: f });
};
const get = (q = '') => new Request(`http://x/api/cms/media${q}`);

describe('POST /media records the library row', () => {
	test('reads dimensions from the header on the server and keeps alt', async () => {
		const { cms, s } = await build();
		const res = await cms.handler(upload(png(), '  A dancer  '));
		const body = await res.json();
		expect(body).toMatchObject({ width: 640, height: 480, alt: 'A dancer', mime: 'image/png' });
		expect(s.rows).toHaveLength(1);
		expect(s.rows[0]).toMatchObject({ width: 640, height: 480, alt: 'A dancer' });
	});

	test('uploading the same bytes twice reuses the row and never deletes the shared blob', async () => {
		const { cms, s, b } = await build();
		await cms.handler(upload(png()));
		const again = await cms.handler(upload(png()));
		expect(again.status).toBe(200);
		expect(s.rows).toHaveLength(1);
		expect(b.state.put).toHaveLength(1);
		expect(b.state.deleted).toEqual([]);
	});

	test('deletes the blob when the row insert fails', async () => {
		const { cms, b } = await build({}, store(true));
		const res = await cms.handler(upload(png()));
		expect(res.status).toBe(500);
		expect(b.state.deleted).toHaveLength(1);
		expect(b.state.deleted[0]).toBe(b.state.put[0]!);
	});
});

describe('GET /media', () => {
	test('lists newest first and paginates with a cursor', async () => {
		const { cms } = await build();
		for (let i = 0; i < 5; i++) {
			await cms.handler(upload(png(i)));
			await new Promise((r) => setTimeout(r, 2));
		}
		const first = await (await cms.handler(get('?limit=2'))).json();
		expect(first.items).toHaveLength(2);
		expect(first.cursor).toBe('2');
		const second = await (await cms.handler(get(`?limit=2&cursor=${first.cursor}`))).json();
		const third = await (await cms.handler(get(`?limit=2&cursor=${second.cursor}`))).json();
		expect(third.items).toHaveLength(1);
		expect(third.cursor).toBeUndefined();
		const all = [...first.items, ...second.items, ...third.items];
		const times = all.map((i: { createdAt: number }) => i.createdAt);
		expect(times).toEqual([...times].sort((a, b) => b - a));
		expect(new Set(all.map((i: { key: string }) => i.key)).size).toBe(5);
	});

	test('denies without a policy, and falls back to the upload policy', async () => {
		const denied = await build({ mediaAccess: {} });
		expect((await denied.cms.handler(get())).status).toBe(403);
		const viaUpload = await build({ mediaAccess: { upload: () => true } });
		expect((await viaUpload.cms.handler(get())).status).toBe(200);
		const listOff = await build({ mediaAccess: { upload: () => true, list: () => false } });
		expect((await listOff.cms.handler(get())).status).toBe(403);
	});
});

describe('DELETE /media/:id', () => {
	test('removes the row and the blob; unknown id is 404', async () => {
		const { cms, s, b } = await build();
		const { id } = await (await cms.handler(upload(png()))).json();
		const res = await cms.handler(
			new Request(`http://x/api/cms/media/${id}`, { method: 'DELETE' }),
		);
		expect(res.status).toBe(200);
		expect(s.rows).toHaveLength(0);
		expect(b.state.deleted).toHaveLength(1);
		const missing = await cms.handler(
			new Request('http://x/api/cms/media/nope', { method: 'DELETE' }),
		);
		expect(missing.status).toBe(404);
	});

	test('denied by default', async () => {
		const { cms } = await build({ mediaAccess: { upload: () => true } });
		const { id } = await (await cms.handler(upload(png()))).json();
		const res = await cms.handler(
			new Request(`http://x/api/cms/media/${id}`, { method: 'DELETE' }),
		);
		expect(res.status).toBe(403);
	});
});
