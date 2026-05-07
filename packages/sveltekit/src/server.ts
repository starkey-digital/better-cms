// Server-only entry. Imports node:async_hooks via request-context, so do
// not import this module from client bundles. The browser-safe surface
// lives in the package root (`better-cms/sveltekit`).
import type {
	CmsConfig,
	CmsContext,
	CmsInstance,
	CollectionsRecord,
	CreateCmsOpts,
	InferRows,
	SchemaIR,
} from '@better-cms/core';
import { createCMS } from '@better-cms/core';
import { __registerSsrFetchProvider } from './api-client.js';
import { getCurrentFetch } from './request-context.js';

// Side-effect: hand the browser-safe createCmsClient a way to read the
// request-scoped event.fetch when it runs during SSR.
__registerSsrFetchProvider(getCurrentFetch);

export { createCms, type Cms, type ServerAuthApi } from './api.js';
export { cmsHandle } from './handle.js';
export { getCurrentFetch, getCurrentRequest, withRequest } from './request-context.js';

let _instance: Promise<CmsInstance> | null = null;

/** Lazy singleton — first call boots the CMS, every subsequent call reuses it. */
export function cms<C extends CollectionsRecord>(
	config: CmsConfig<C>,
	opts?: CreateCmsOpts,
): Promise<CmsInstance> {
	if (!_instance) _instance = createCMS(config, opts);
	return _instance;
}

export function _resetCms(): void {
	_instance = null;
}

export interface ServerApi<C extends CollectionsRecord> {
	find<K extends keyof C>(collection: K, id: string): Promise<InferRows<SchemaIR<C>>[K] | null>;
	list<K extends keyof C>(
		collection: K,
		opts?: {
			where?: Record<string, unknown>;
			limit?: number;
			offset?: number;
			orderBy?: { field: string; dir?: 'asc' | 'desc' }[];
		},
	): Promise<InferRows<SchemaIR<C>>[K][]>;
	count<K extends keyof C>(collection: K, where?: Record<string, unknown>): Promise<number>;
	/** Read a singleton's row. Returns null if never written. */
	getSingleton<K extends keyof C>(name: K): Promise<InferRows<SchemaIR<C>>[K] | null>;
}

const SINGLETON_ID = 'default';

export function serverApi<C extends CollectionsRecord>(ctx: CmsContext<C>): ServerApi<C> {
	return {
		find: (c, id) => ctx.store.findOne(c as string, { id }) as Promise<never>,
		list: (c, o = {}) => ctx.store.findMany(c as string, o) as Promise<never>,
		count: (c, where) => ctx.store.count(c as string, where),
		getSingleton: (c) => ctx.store.findOne(c as string, { id: SINGLETON_ID }) as Promise<never>,
	};
}
