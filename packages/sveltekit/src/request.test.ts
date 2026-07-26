import { describe, expect, test } from 'bun:test';
import type { CmsConfig } from '@better-cms/core';
import type { RequestEvent } from '@sveltejs/kit';
import { resolveRequestCtx, withRequestEvent } from './request.js';

function fakeEvent(): RequestEvent {
	return {
		request: new Request('http://localhost/'),
		locals: {},
		url: new URL('http://localhost/'),
	} as unknown as RequestEvent;
}

function configWith(context: () => unknown): { config: CmsConfig<any, any>; calls: () => number } {
	let calls = 0;
	const config = {
		collections: {},
		adapter: {} as never,
		auth: {
			context: async () => {
				calls++;
				return context();
			},
		},
	} as unknown as CmsConfig<any, any>;
	return { config, calls: () => calls };
}

describe('resolveRequestCtx', () => {
	test('resolves the auth context once per request', async () => {
		const a = configWith(() => ({ user: 'alice' }));
		await withRequestEvent(fakeEvent(), async () => {
			expect(await resolveRequestCtx(a.config)).toEqual({ user: 'alice' });
			expect(await resolveRequestCtx(a.config)).toEqual({ user: 'alice' });
		});
		expect(a.calls()).toBe(1);
	});

	test('caches a null context instead of re-resolving it', async () => {
		const a = configWith(() => null);
		await withRequestEvent(fakeEvent(), async () => {
			expect(await resolveRequestCtx(a.config)).toBeNull();
			expect(await resolveRequestCtx(a.config)).toBeNull();
		});
		expect(a.calls()).toBe(1);
	});

	test('does not leak one CMS context to another within the same request', async () => {
		// An app may mount several CMS instances — multi-tenant, or a sub-site
		// with its own store. Caching one context per request would hand the
		// second instance the first one's identity without ever calling its
		// provider, so its access policies would authorize the wrong user.
		const tenantA = configWith(() => ({ tenant: 'a' }));
		const tenantB = configWith(() => ({ tenant: 'b' }));

		await withRequestEvent(fakeEvent(), async () => {
			expect(await resolveRequestCtx(tenantA.config)).toEqual({ tenant: 'a' });
			expect(await resolveRequestCtx(tenantB.config)).toEqual({ tenant: 'b' });
		});

		expect(tenantA.calls()).toBe(1);
		expect(tenantB.calls()).toBe(1);
	});

	test('re-resolves for a new request', async () => {
		const a = configWith(() => ({ user: 'alice' }));
		await withRequestEvent(fakeEvent(), () => resolveRequestCtx(a.config));
		await withRequestEvent(fakeEvent(), () => resolveRequestCtx(a.config));
		expect(a.calls()).toBe(2);
	});

	test('does not write its cache into event.locals', async () => {
		// Nothing the app puts in locals should be able to collide with, or
		// forge, a resolved identity.
		const a = configWith(() => ({ user: 'alice' }));
		const event = fakeEvent();
		await withRequestEvent(event, () => resolveRequestCtx(a.config));
		expect(Object.keys(event.locals as object)).toEqual([]);
	});

	test('returns undefined outside a request scope', async () => {
		const a = configWith(() => ({ user: 'alice' }));
		expect(await resolveRequestCtx(a.config)).toBeUndefined();
		expect(a.calls()).toBe(0);
	});
});
