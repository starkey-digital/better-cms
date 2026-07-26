import { describe, expect, test } from 'bun:test';
import type { CmsConfig, MediaListPage, MediaObject, Row } from '@better-cms/core';
import { sweepMedia } from './media-gc.js';

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR);

function object(key: string, hoursOld: number | null, size = 1024): MediaObject {
	return {
		key,
		url: `https://cdn.test/${key}`,
		mime: 'image/png',
		size,
		...(hoursOld === null ? {} : { lastModified: ago(hoursOld) }),
	};
}

/**
 * A config whose store reports `referenced` keys in `cms_media` and whose
 * bucket contains `objects`.
 */
function cmsWith(referenced: string[], objects: MediaObject[]) {
	const deleted: string[] = [];
	const listCalls: (string | undefined)[] = [];
	const config = {
		collections: {},
		adapter: {
			async init() {},
			async findMany(collection: string, query: { limit?: number; offset?: number }) {
				if (collection !== 'cms_media') return [];
				const start = query.offset ?? 0;
				return referenced.slice(start, start + (query.limit ?? 500)).map((key) => ({ key }) as Row);
			},
			async create(_c: string, d: Row) {
				return d;
			},
			async update(_c: string, _w: unknown, d: Row) {
				return d;
			},
			async delete() {
				return 0;
			},
			async findOne() {
				return null;
			},
			async count() {
				return 0;
			},
		},
		media: {
			async put() {
				throw new Error('not used');
			},
			async delete(key: string) {
				deleted.push(key);
			},
			async list(prefix?: string): Promise<MediaListPage> {
				listCalls.push(prefix);
				const items = prefix ? objects.filter((o) => o.key.startsWith(prefix)) : objects;
				return { items };
			},
		},
	} as unknown as CmsConfig;
	return { config, deleted, listCalls };
}

describe('sweepMedia', () => {
	test('reports objects no cms_media row references', async () => {
		const { config } = cmsWith(['kept.png'], [object('kept.png', 48), object('orphan.png', 48)]);
		const res = await sweepMedia(config);
		expect(res.orphans.map((o) => o.key)).toEqual(['orphan.png']);
		expect(res.scanned).toBe(2);
		expect(res.referenced).toBe(1);
	});

	test('does not delete without --apply', async () => {
		const { config, deleted } = cmsWith([], [object('orphan.png', 48)]);
		const res = await sweepMedia(config);
		expect(res.applied).toBe(false);
		expect(res.deleted).toEqual([]);
		expect(deleted).toEqual([]);
	});

	test('deletes with --apply', async () => {
		const { config, deleted } = cmsWith([], [object('orphan.png', 48)]);
		const res = await sweepMedia(config, { apply: true });
		expect(res.deleted).toEqual(['orphan.png']);
		expect(deleted).toEqual(['orphan.png']);
	});

	test('spares objects newer than the age threshold', async () => {
		// An upload in flight has written its blob but not yet its row. Deleting
		// it would destroy a live request's asset.
		const { config, deleted } = cmsWith([], [object('in-flight.png', 0.1)]);
		const res = await sweepMedia(config, { apply: true });
		expect(res.orphans).toEqual([]);
		expect(res.skippedTooNew).toBe(1);
		expect(deleted).toEqual([]);
	});

	test('honours an explicit age threshold', async () => {
		const { config } = cmsWith([], [object('two-hours.png', 2)]);
		expect((await sweepMedia(config, { minAgeHours: 24 })).orphans).toEqual([]);
		expect((await sweepMedia(config, { minAgeHours: 1 })).orphans).toHaveLength(1);
	});

	test('refuses to judge an object with no timestamp', async () => {
		// Without a modified time the object could be seconds old; not deleting
		// is the only safe default.
		const { config, deleted } = cmsWith([], [object('undated.png', null)]);
		const res = await sweepMedia(config, { apply: true });
		expect(res.skippedTooNew).toBe(1);
		expect(deleted).toEqual([]);
	});

	test('limits the sweep to a prefix', async () => {
		const { config, listCalls } = cmsWith(
			[],
			[object('covers/a.png', 48), object('other/b.png', 48)],
		);
		const res = await sweepMedia(config, { prefix: 'covers/' });
		expect(listCalls).toEqual(['covers/']);
		expect(res.orphans.map((o) => o.key)).toEqual(['covers/a.png']);
	});

	test('explains itself when the store cannot list', async () => {
		const { config } = cmsWith([], []);
		(config.media as { list?: unknown }).list = undefined;
		await expect(sweepMedia(config)).rejects.toThrow(/cannot list objects/);
	});

	test('explains itself when no media store is configured', async () => {
		const { config } = cmsWith([], []);
		(config as { media?: unknown }).media = undefined;
		await expect(sweepMedia(config)).rejects.toThrow(/no media store configured/);
	});
});
