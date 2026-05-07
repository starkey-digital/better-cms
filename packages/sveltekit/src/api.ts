import { applyOps, getCmsTables } from '@better-cms/core';
import type {
	ClientCmsConfig,
	CmsConfig,
	CmsOp,
	CollectionDef,
	CollectionsRecord,
	FieldsRecord,
	FindManyQuery,
	InferRows,
	RowOf,
	SchemaIR,
	WhereClause,
} from '@better-cms/core';
import { cms as resolveCms } from './server.js';

const SINGLETON_ID = 'default';

export interface CollectionApi<T> {
	list(opts?: FindManyQuery): Promise<T[]>;
	find(id: string): Promise<T | null>;
	/** Look up by id first, then by `slug` field if the collection has one. */
	get(idOrSlug: string): Promise<T | null>;
	count(where?: WhereClause): Promise<number>;
}

export interface SingletonApi<T> {
	get(): Promise<T | null>;
	set(data: Partial<T>): Promise<T>;
}

export type Cms<C extends CollectionsRecord> = {
	[K in keyof C]: C[K] extends CollectionDef<FieldsRecord, 'singleton'>
		? SingletonApi<InferRows<SchemaIR<C>>[K]>
		: CollectionApi<InferRows<SchemaIR<C>>[K]>;
};

/**
 * Build a property-style API from a CMS config:
 *
 *   import { createCms } from 'better-cms/sveltekit';
 *   const cms = createCms(config);
 *   await cms.posts.list({ limit: 20 });
 *   await cms.posts.get('hello-world');     // tries id, then slug
 *   await cms.settings.get();               // singleton
 *   await cms.settings.set({ siteTitle });
 *
 * The first method call lazily boots the CMS singleton (the same one
 * `cmsHandle` uses), so importing this module is cheap.
 */
export function createCms<C extends CollectionsRecord>(config: CmsConfig<C>): Cms<C> {
	const out: Record<string, unknown> = {};
	for (const [name, def] of Object.entries(config.collections) as [string, CollectionDef][]) {
		out[name] = def.kind === 'singleton' ? singletonOps(config, name) : collectionOps(config, name);
	}
	return out as Cms<C>;
}

function collectionOps(config: CmsConfig, name: string): CollectionApi<RowOf<CollectionDef>> {
	return {
		async list(opts) {
			const inst = await resolveCms(config);
			return inst.context.store.findMany(name, opts) as Promise<RowOf<CollectionDef>[]>;
		},
		async find(id) {
			const inst = await resolveCms(config);
			return inst.context.store.findOne(name, { id }) as Promise<RowOf<CollectionDef> | null>;
		},
		async get(idOrSlug) {
			const inst = await resolveCms(config);
			const byId = (await inst.context.store.findOne(name, {
				id: idOrSlug,
			})) as RowOf<CollectionDef> | null;
			if (byId) return byId;
			const fields = inst.context.schema.collections[name]?.fields;
			if (!fields || !('slug' in fields)) return null;
			const [bySlug] = (await inst.context.store.findMany(name, {
				where: { slug: idOrSlug },
				limit: 1,
			})) as RowOf<CollectionDef>[];
			return bySlug ?? null;
		},
		async count(where) {
			const inst = await resolveCms(config);
			return inst.context.store.count(name, where);
		},
	};
}

/**
 * Browser-side counterpart of {@link createCms}: same property shape, but
 * each method talks to the CMS over HTTP via the handler. Pair with
 * `clientCmsConfig(config)` shipped through a `+page.server.ts` / layout
 * loader so types flow from your collection definitions into components.
 *
 *   // src/lib/cms.client.ts
 *   import { createCmsClient } from 'better-cms/sveltekit';
 *   import type { ClientCmsConfig } from 'better-cms/sveltekit';
 *
 *   export function getCMS(config: ClientCmsConfig) {
 *     return createCmsClient(config);
 *   }
 *
 *   // some component
 *   import { getCMS } from '$lib/cms.client';
 *   const cms = $derived(getCMS(page.data.cmsConfig));
 *   const post = $derived(await cms.posts.get(page.params.slug));
 */
export function createCmsClient<C extends Record<string, CollectionDef>>(
	clientConfig: ClientCmsConfig<C>,
	fetcher: typeof fetch = fetch,
): Cms<C extends CollectionsRecord ? C : CollectionsRecord> {
	const basePath = (clientConfig.basePath ?? '/api/cms').replace(/\/$/, '');
	const out: Record<string, unknown> = {};
	for (const [name, def] of Object.entries(clientConfig.collections) as [string, CollectionDef][]) {
		out[name] =
			def.kind === 'singleton'
				? clientSingleton(basePath, name, fetcher)
				: clientCollection(basePath, name, fetcher);
	}
	return out as never;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`[better-cms] ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
	}
	return (await res.json()) as T;
}

function clientCollection(
	basePath: string,
	name: string,
	fetcher: typeof fetch,
): CollectionApi<RowOf<CollectionDef>> {
	return {
		async list(opts) {
			const params = new URLSearchParams();
			if (opts?.limit != null) params.set('limit', String(opts.limit));
			if (opts?.offset != null) params.set('offset', String(opts.offset));
			const qs = params.toString();
			const res = await fetcher(`${basePath}/collections/${name}${qs ? `?${qs}` : ''}`);
			const body = await jsonOrThrow<{ rows: RowOf<CollectionDef>[] }>(res);
			return body.rows;
		},
		async find(id) {
			const res = await fetcher(`${basePath}/collections/${name}/${encodeURIComponent(id)}`);
			if (res.status === 404) return null;
			const body = await jsonOrThrow<{ row: RowOf<CollectionDef> | null }>(res);
			return body.row;
		},
		async get(idOrSlug) {
			const byId = await this.find(idOrSlug);
			if (byId) return byId;
			// the HTTP API doesn't expose a slug filter directly; emulate with list+filter
			const all = await this.list({ limit: 1, where: { slug: idOrSlug } });
			return all[0] ?? null;
		},
		async count(_where) {
			// the HTTP handler doesn't expose a count endpoint yet; pull list length
			const all = await this.list({});
			return all.length;
		},
	};
}

function clientSingleton(
	basePath: string,
	name: string,
	fetcher: typeof fetch,
): SingletonApi<RowOf<CollectionDef>> {
	return {
		async get() {
			const res = await fetcher(`${basePath}/singletons/${name}`);
			if (res.status === 404) return null;
			const body = await jsonOrThrow<{ row: RowOf<CollectionDef> | null }>(res);
			return body.row;
		},
		async set(data) {
			const res = await fetcher(`${basePath}/singletons/${name}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(data),
			});
			const body = await jsonOrThrow<{ row: RowOf<CollectionDef> }>(res);
			return body.row;
		},
	};
}

function singletonOps(config: CmsConfig, name: string): SingletonApi<RowOf<CollectionDef>> {
	return {
		async get() {
			const inst = await resolveCms(config);
			return inst.context.store.findOne(name, {
				id: SINGLETON_ID,
			}) as Promise<RowOf<CollectionDef> | null>;
		},
		async set(data) {
			const inst = await resolveCms(config);
			const schema = getCmsTables(config);
			const existing = await inst.context.store.findOne(name, { id: SINGLETON_ID });
			const op: CmsOp = existing
				? { op: 'set', collection: name, id: SINGLETON_ID, data: data as Record<string, unknown> }
				: {
						op: 'create',
						collection: name,
						data: { ...(data as Record<string, unknown>), id: SINGLETON_ID },
					};
			const [res] = await applyOps([op], { store: inst.context.store, schema });
			if (!res?.ok) throw new Error(res?.error?.message ?? 'singleton write failed');
			return res.row as RowOf<CollectionDef>;
		},
	};
}
