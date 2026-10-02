import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { type CmsInstance, createCMS } from '@better-cms/core';
import { collection, slug } from '@better-cms/zod';
import { createClient } from '@libsql/client';
import { z } from 'zod';
import { libsqlAdapter } from './adapter.js';

const shows = () =>
	collection({
		schema: z.object({
			venue: z.string(),
			day: z.date().meta({ dateOnly: true }),
			notes: z.array(z.string()).optional(),
		}),
		admin: { sort: { field: 'day', direction: 'asc' } },
		access: { create: () => true, update: () => true },
	});

let cms: CmsInstance | undefined;
afterEach(async () => {
	await cms?.close();
	cms = undefined;
});

async function boot(collections: Record<string, ReturnType<typeof shows>>) {
	cms = await createCMS({ collections, adapter: libsqlAdapter({ url: ':memory:' }) });
	return cms;
}

async function seed(n: number) {
	const c = await boot({ shows: shows() });
	const api = c.api() as unknown as { shows: any };
	for (let i = 1; i <= n; i++) {
		await api.shows.create({ venue: `V${i}`, day: `2026-01-${String(10 - i).padStart(2, '0')}` });
	}
	return api.shows;
}

describe('list queries', () => {
	test('dates arrive as ISO strings and round-trip through the HTTP handler', async () => {
		const c = await boot({ shows: shows() });
		const post = await c.handler(
			new Request('http://x/api/cms/ops', {
				method: 'POST',
				body: JSON.stringify({
					ops: [{ op: 'create', collection: 'shows', data: { venue: 'A', day: '2026-03-04' } }],
				}),
			}),
		);
		expect(((await post.json()) as any).results[0].ok).toBe(true);
		const list = await c.handler(new Request('http://x/api/cms/collections/shows'));
		const body = (await list.json()) as any;
		expect(body.rows[0].day).toBe('2026-03-04T00:00:00.000Z');
		expect(body).toMatchObject({ total: 1, limit: 50, offset: 0 });
	});

	test('defaults to admin.sort', async () => {
		const shows = await seed(4);
		const rows = await shows.list();
		expect(rows.map((r: any) => r.venue)).toEqual(['V4', 'V3', 'V2', 'V1']);
	});

	test('explicit sort overrides admin.sort', async () => {
		const shows = await seed(4);
		const rows = await shows.list({ sort: { field: 'venue', direction: 'desc' } });
		expect(rows.map((r: any) => r.venue)).toEqual(['V4', 'V3', 'V2', 'V1']);
		const asc = await shows.list({ sort: { field: 'venue' } });
		expect(asc[0].venue).toBe('V1');
	});

	test('falls back to createdAt desc without admin.sort', async () => {
		const c = await boot({
			plain: collection({
				schema: z.object({ n: z.number() }),
				access: { create: () => true },
			}) as any,
		});
		const plain = (c.api() as any).plain;
		await plain.create({ n: 1 });
		await new Promise((r) => setTimeout(r, 5));
		await plain.create({ n: 2 });
		expect((await plain.list()).map((r: any) => r.n)).toEqual([2, 1]);
	});

	test('limit, offset and total', async () => {
		const shows = await seed(5);
		const page = await shows.listPage({ limit: 2, offset: 2 });
		expect(page.rows.map((r: any) => r.venue)).toEqual(['V3', 'V2']);
		expect(page).toMatchObject({ total: 5, limit: 2, offset: 2 });
	});

	test('total honours where, ignoring paging', async () => {
		const shows = await seed(5);
		const page = await shows.listPage({ where: { venue: 'V2' }, limit: 1 });
		expect(page.total).toBe(1);
	});

	test('limit is capped', async () => {
		const shows = await seed(1);
		expect((await shows.listPage({ limit: 100000 })).limit).toBe(500);
	});

	test('rejects sorting on non-columns and bad paging', async () => {
		const shows = await seed(1);
		await expect(shows.list({ sort: { field: 'notes' } })).rejects.toThrow(/cannot sort/);
		await expect(shows.list({ sort: { field: 'ghost' } })).rejects.toThrow(/cannot sort/);
		await expect(shows.list({ limit: -1 })).rejects.toThrow(/limit/);
		await expect(shows.list({ offset: Number.NaN })).rejects.toThrow(/offset/);
	});

	test('HTTP maps sort/direction/limit/offset and rejects bad sort with 400', async () => {
		const c = await boot({ shows: shows() });
		const api = c.api() as any;
		for (const v of ['A', 'B', 'C']) await api.shows.create({ venue: v, day: '2026-01-01' });
		const res = await c.handler(
			new Request('http://x/api/cms/collections/shows?sort=venue&direction=desc&limit=2&offset=1'),
		);
		const body = (await res.json()) as any;
		expect(body.rows.map((r: any) => r.venue)).toEqual(['B', 'A']);
		expect(body.total).toBe(3);
		const bad = await c.handler(new Request('http://x/api/cms/collections/shows?sort=notes'));
		expect(bad.status).toBe(400);
	});
});

describe('schema evolution', () => {
	const v1 = () => collection({ schema: z.object({ title: z.string() }) });
	const v2 = () =>
		collection({
			schema: z.object({
				title: z.string(),
				subtitle: z.string().optional(),
				code: z.string().optional(),
			}),
			access: { create: () => true },
		});

	async function columns(client: ReturnType<typeof createClient>) {
		const res = await client.execute('PRAGMA table_info("posts")');
		return res.rows.map((r) => String(r.name));
	}

	test('adds columns that appeared after the table was created, keeping data', async () => {
		const client = createClient({ url: ':memory:' });
		const first = await createCMS({
			collections: { posts: v1() },
			adapter: libsqlAdapter({ url: '', client }),
		});
		await client.execute({
			sql: 'INSERT INTO "posts" (id, title) VALUES (?, ?)',
			args: ['1', 'old'],
		});
		expect(await columns(client)).not.toContain('subtitle');
		void first;

		const second = await createCMS({
			collections: { posts: v2() },
			adapter: libsqlAdapter({ url: '', client }),
		});
		expect(await columns(client)).toEqual(expect.arrayContaining(['subtitle', 'code']));
		const posts = (second.api() as any).posts;
		await posts.create({ title: 'new', subtitle: 'sub' });
		const rows = await posts.list();
		expect(rows.map((r: any) => r.title).sort()).toEqual(['new', 'old']);
		cms = second;
	});

	test('is idempotent across repeated boots', async () => {
		const client = createClient({ url: ':memory:' });
		await createCMS({ collections: { posts: v1() }, adapter: libsqlAdapter({ url: '', client }) });
		for (let i = 0; i < 3; i++) {
			await createCMS({
				collections: { posts: v2() },
				adapter: libsqlAdapter({ url: '', client }),
			});
		}
		expect((await columns(client)).filter((c) => c === 'subtitle')).toHaveLength(1);
	});

	// The error is synthesised: real SQLite errors are masked by jiti's Error patch when the whole workspace runs in one bun process.
	test('tolerates a duplicate-column race from another cold start', async () => {
		const client = createClient({ url: ':memory:' });
		await createCMS({ collections: { posts: v1() }, adapter: libsqlAdapter({ url: '', client }) });
		const realExecute = client.execute.bind(client);
		let raced = false;
		client.execute = (async (stmt: any) => {
			const sql = typeof stmt === 'string' ? stmt : stmt.sql;
			if (!raced && sql.startsWith('ALTER TABLE')) {
				raced = true;
				await realExecute(stmt);
				throw new Error('SQLITE_ERROR: duplicate column name: subtitle');
			}
			return realExecute(stmt);
		}) as typeof client.execute;
		await createCMS({ collections: { posts: v2() }, adapter: libsqlAdapter({ url: '', client }) });
		expect(raced).toBe(true);
		expect(await columns(client)).toContain('subtitle');
	});

	test('rethrows other ALTER failures', async () => {
		const client = createClient({ url: ':memory:' });
		await createCMS({ collections: { posts: v1() }, adapter: libsqlAdapter({ url: '', client }) });
		const realExecute = client.execute.bind(client);
		client.execute = (async (stmt: any) => {
			const sql = typeof stmt === 'string' ? stmt : stmt.sql;
			if (sql.startsWith('ALTER TABLE')) throw new Error('disk full');
			return realExecute(stmt);
		}) as typeof client.execute;
		await expect(
			createCMS({ collections: { posts: v2() }, adapter: libsqlAdapter({ url: '', client }) }),
		).rejects.toThrow('disk full');
	});

	test('warns once and leaves a column alone when its type differs', async () => {
		const client = createClient({ url: ':memory:' });
		await client.execute('CREATE TABLE "posts" (id TEXT PRIMARY KEY, title INTEGER)');
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		await createCMS({ collections: { posts: v1() }, adapter: libsqlAdapter({ url: '', client }) });
		const mismatches = warn.mock.calls.filter((c) => String(c[0]).includes('posts.title'));
		warn.mockRestore();
		expect(mismatches).toHaveLength(1);
		const info = await client.execute('PRAGMA table_info("posts")');
		expect(info.rows.find((r) => r.name === 'title')?.type).toBe('INTEGER');
	});

	test('a new unique field is enforced by a unique index', async () => {
		const client = createClient({ url: ':memory:' });
		await createCMS({ collections: { posts: v1() }, adapter: libsqlAdapter({ url: '', client }) });
		cms = await createCMS({
			collections: {
				posts: collection({
					schema: z.object({ title: z.string(), handle: slug() }),
					access: { create: () => true },
				}),
			},
			adapter: libsqlAdapter({ url: '', client }),
		});
		const posts = (cms.api() as any).posts;
		await posts.create({ title: 'a', handle: 'same' });
		await expect(posts.create({ title: 'b', handle: 'same' })).rejects.toThrow();
	});

	test('migrate:false only records the schema', async () => {
		const client = createClient({ url: ':memory:' });
		await client.execute('CREATE TABLE "posts" (id TEXT PRIMARY KEY, title TEXT)');
		cms = await createCMS({
			collections: { posts: v2() },
			adapter: libsqlAdapter({ url: '', client, migrate: false }),
		});
		expect(await columns(client)).not.toContain('subtitle');
		expect(await (cms.api() as any).posts.count()).toBe(0);
	});
});

describe('/_meta', () => {
	test('serves labels, field meta and admin options with no functions', async () => {
		const c = await boot({
			shows: collection({
				schema: z.object({
					venue: z.string().meta({
						label: 'Venue',
						description: 'Where',
						placeholder: 'The Dome',
						multiline: true,
					}),
					day: z.date().meta({ dateOnly: true }),
					secret: z.string().optional().meta({ hidden: true }),
					tracks: z
						.array(z.object({ t: z.string().meta({ label: 'Song' }) }))
						.meta({ itemLabel: 'Track' }),
				}),
				label: 'Shows',
				admin: { title: '{day} {venue}', group: 'Live', previewUrl: '/#shows' },
			}) as any,
		});
		const res = await c.handler(new Request('http://x/api/cms/_meta'));
		const meta = (await res.json()) as any;
		const shows = meta.collections.shows;
		expect(shows).toMatchObject({
			label: 'Shows',
			admin: { title: '{day} {venue}', group: 'Live' },
		});
		expect(shows.fields.venue).toMatchObject({
			label: 'Venue',
			description: 'Where',
			placeholder: 'The Dome',
		});
		expect(shows.fields.venue.editor.props.multiline).toBe(true);
		expect(shows.fields.day.editor.props.dateOnly).toBe(true);
		expect(shows.fields.secret.hidden).toBe(true);
		expect(shows.fields.tracks.editor.props.itemLabel).toBe('Track');
		expect(shows.fields.tracks.array.of.object.fields.t.label).toBe('Song');
		expect(JSON.stringify(shows)).not.toMatch(/validation|schemas|access|hooks/);
	});
});
