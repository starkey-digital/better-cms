import { describe, expect, test } from 'bun:test';
import type { CmsConfig, LiveEvent, LiveTransport } from '@better-cms/core';
import { _collection } from '@better-cms/core';
import type { RequestEvent } from '@sveltejs/kit';
import { _cmsConfigOf, createCms } from './api.js';
import { cmsHandle } from './handle.js';
import { cmsInstance } from './instance.js';

function recordingTransport(): LiveTransport & { events: LiveEvent[] } {
	const events: LiveEvent[] = [];
	return {
		events,
		publish(event) {
			events.push(event);
		},
		subscribe() {
			return () => {};
		},
	};
}

const adapter = {
	async init() {},
	async create(_c: string, data: Record<string, unknown>) {
		return data;
	},
	async update(_c: string, _w: unknown, data: Record<string, unknown>) {
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

function eventFor(url: string): RequestEvent {
	return {
		request: new Request(url),
		url: new URL(url),
		locals: {},
	} as unknown as RequestEvent;
}

describe('runtime options survive either boot order', () => {
	test('an HTTP request booting first still installs the configured transport', async () => {
		// cmsHandle and the first `cms.*` call race to boot the shared instance,
		// and in a real app the request usually wins. If the handle booted
		// without the options createCms was given, a configured Redis transport
		// would be silently replaced by the in-memory default.
		const live = recordingTransport();
		const cms = createCms({
			collections: {},
			adapter: adapter as never,
			runtime: { live },
		});

		const handle = cmsHandle(cms);
		await handle({
			event: eventFor('http://localhost/api/cms/_meta'),
			resolve: async () => new Response('unhandled'),
		} as never);

		const instance = await cmsInstance(_cmsConfigOf(cms));
		expect(instance.live).toBe(live);
	});

	test('a cms.* call booting first installs the same transport', async () => {
		const live = recordingTransport();
		const cms = createCms({
			collections: { things: _collection({ kind: 'collection', fields: {} }) },
			adapter: adapter as never,
			runtime: { live },
		});

		// Boot through the API surface, the way app code does.
		await cms.things.list();

		const instance = await cmsInstance(_cmsConfigOf(cms));
		expect(instance.live).toBe(live);
	});
});

describe('cmsInstance caching', () => {
	test('returns one instance per config', async () => {
		const config = { collections: {}, adapter } as unknown as CmsConfig<any, any>;
		expect(await cmsInstance(config)).toBe(await cmsInstance(config));
	});

	test('keeps separate instances for separate configs', async () => {
		const a = { collections: {}, adapter } as unknown as CmsConfig<any, any>;
		const b = { collections: {}, adapter } as unknown as CmsConfig<any, any>;
		expect(await cmsInstance(a)).not.toBe(await cmsInstance(b));
	});

	test('a failed boot is retried rather than cached forever', async () => {
		let attempt = 0;
		const flaky = {
			...adapter,
			async init() {
				attempt++;
				if (attempt === 1) throw new Error('connection refused');
			},
		};
		const config = { collections: {}, adapter: flaky } as unknown as CmsConfig<any, any>;

		await expect(cmsInstance(config)).rejects.toThrow('connection refused');
		// A transient outage at boot must not poison the config for the
		// lifetime of the process.
		expect(await cmsInstance(config)).toBeDefined();
		expect(attempt).toBe(2);
	});
});
