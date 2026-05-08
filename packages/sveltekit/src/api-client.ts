import type {
	CmsConfig,
	CmsMeta,
	CollectionDef,
	CollectionsRecord,
	FieldsRecord,
	FindManyQuery,
	InferRows,
	SchemaIR,
	WhereClause,
} from '@better-cms/core';

export interface CollectionApi<T> {
	list(opts?: FindManyQuery): Promise<T[]>;
	find(id: string): Promise<T | null>;
	/** Look up by id, falling back to the collection's slug field if it has one. Server resolves. */
	get(idOrSlug: string): Promise<T | null>;
	count(where?: WhereClause): Promise<number>;
	create(data: Partial<T>): Promise<T>;
	update(id: string, data: Partial<T>): Promise<T>;
	delete(id: string): Promise<void>;
	/** Standard Schema validators (`create` / `update` / `full`) for use with SvelteKit `command(...)` / tRPC / hono / anywhere a schema is accepted. */
	readonly schemas: {
		readonly create: import('@better-cms/core').StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>;
		readonly update: import('@better-cms/core').StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>;
		readonly full: import('@better-cms/core').StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>;
	};
}

export interface SingletonApi<T> {
	get(): Promise<T | null>;
	set(data: Partial<T>): Promise<T>;
}

export interface ClientAuthApi<Ctx = unknown> {
	context(): Promise<Ctx | null>;
	login(password: string, turnstileToken?: string): Promise<{ ok: true } | { error: string }>;
	logout(): Promise<void>;
}

export type { CmsMeta, CmsMetaCollection, CmsMetaField } from '@better-cms/core';

export type CmsClient<C extends CollectionsRecord, Ctx = unknown> = {
	[K in keyof C]: C[K] extends CollectionDef<FieldsRecord, 'singleton'>
		? SingletonApi<InferRows<SchemaIR<C>>[K]>
		: CollectionApi<InferRows<SchemaIR<C>>[K]>;
} & {
	auth: ClientAuthApi<Ctx>;
	/** Lazy-fetch the server's structural metadata (kinds, fields, slug fields). Cached after first call. Used by `<CmsAdmin>` to build the editor UI. */
	meta(): Promise<CmsMeta>;
	/** Upload a media asset. Returns the storage key + public URL. */
	uploadMedia(file: File | Blob, folder?: string): Promise<{ key: string; url: string }>;
	/** Effective base path the client uses for HTTP calls. */
	readonly basePath: string;
};

/**
 * Type helpers — extract collections and Ctx from the user's resolved
 * `Cms` (the value of `createCms(...)`). Type-only imports erase before
 * bundling, so consumer's client.ts can `import type { Cms }` from its
 * `$lib/cms/server/cms` without dragging server runtime into the browser.
 */
type CollectionsOf<T> = T extends { __collections?: infer C extends CollectionsRecord }
	? C
	: T extends { collections: infer C extends CollectionsRecord }
		? C
		: never;
type CtxOf<T> = T extends { auth: { context(): Promise<infer R | null> | infer R | null } }
	? R
	: T extends { auth?: { context: (req: Request) => infer R | Promise<infer R> } }
		? R
		: unknown;

/**
 * SSR fetch provider — populated by `better-cms/sveltekit/server`'s init
 * side-effect to expose SvelteKit's request-scoped `event.fetch`. Browser
 * builds never import the server entry, so this stays null and we use the
 * supplied fetcher (typically `globalThis.fetch`).
 */
let _ssrFetchProvider: (() => typeof fetch | null) | null = null;
export function __registerSsrFetchProvider(fn: () => typeof fetch | null): void {
	_ssrFetchProvider = fn;
}

export interface CreateCmsClientOpts {
	basePath?: string;
	fetch?: typeof fetch;
}

/**
 * Build a property-style HTTP client for the CMS. Browser-safe — no Node
 * imports. Single generic `TCms` carries both the collections shape and the
 * auth context type:
 *
 *   import type { Cms } from '$lib/cms/server/cms';
 *   export const cmsClient = createCmsClient<Cms>({ basePath: '/api/cms' });
 *
 * The Proxy dispatches collection / singleton names lazily — no manifest is
 * baked at build time. Slug-based lookups via `cms.posts.get(slug)` rely on
 * the server's slug-fallback resolver: `GET /collections/:name/:idOrSlug`
 * tries `id` first, then falls back to the collection's slug-tagged field.
 *
 * During SSR, the request-scoped `event.fetch` (registered by
 * `better-cms/sveltekit/server`) is used so relative URLs resolve correctly.
 */
export function createCmsClient<TCms = CmsConfig>(
	opts: CreateCmsClientOpts = {},
): CmsClient<CollectionsOf<TCms>, CtxOf<TCms>> {
	const basePath = (opts.basePath ?? '/api/cms').replace(/\/$/, '');
	const fetcher = ssrAwareFetch(opts.fetch ?? fetch);

	const auth = clientAuth(basePath, fetcher);
	let metaCache: Promise<CmsMeta> | null = null;
	const meta = (): Promise<CmsMeta> => {
		if (!metaCache) {
			metaCache = (async () => {
				const res = await fetcher(`${basePath}/_meta`);
				if (!res.ok) throw new Error(`[better-cms] failed to fetch /_meta: ${res.status}`);
				return (await res.json()) as CmsMeta;
			})();
		}
		return metaCache;
	};
	const uploadMedia = async (file: File | Blob, folder?: string) => {
		const fd = new FormData();
		fd.append('file', file as Blob);
		if (folder) fd.append('folder', folder);
		const res = await fetcher(`${basePath}/media`, { method: 'POST', body: fd });
		const body = await jsonOrThrow<{ key: string; url: string }>(res);
		return body;
	};

	return new Proxy({} as Record<string, unknown>, {
		get(target, prop: string | symbol) {
			if (prop === 'auth') return auth;
			if (prop === 'meta') return meta;
			if (prop === 'basePath') return basePath;
			if (prop === 'uploadMedia') return uploadMedia;
			if (typeof prop !== 'string') return undefined;
			const cached = target[prop];
			if (cached) return cached;
			const api = collectionOrSingleton(basePath, prop, fetcher);
			target[prop] = api;
			return api;
		},
	}) as CmsClient<CollectionsOf<TCms>, CtxOf<TCms>>;
}

function ssrAwareFetch(fetcher: typeof fetch): typeof fetch {
	if (typeof window !== 'undefined') return fetcher;
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const eventFetch = _ssrFetchProvider?.();
		if (eventFetch) return eventFetch(input as never, init);
		return fetcher(input, init);
	}) as typeof fetch;
}

function clientAuth(basePath: string, fetcher: typeof fetch): ClientAuthApi {
	return {
		async context() {
			const res = await fetcher(`${basePath}/auth/context`);
			if (!res.ok) return null;
			const body = (await res.json()) as { ctx: unknown };
			return body.ctx ?? null;
		},
		async login(password, turnstileToken) {
			const res = await fetcher(`${basePath}/login`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password, turnstileToken }),
			});
			const body = (await res.json()) as { ok?: true; error?: { code: string; message: string } };
			if (body.ok) return { ok: true };
			return { error: body.error?.message ?? 'login failed' };
		},
		async logout() {
			await fetcher(`${basePath}/logout`, { method: 'POST' });
		},
	};
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
	if (!res.ok) {
		const detail = await res.text().catch(() => '');
		throw new Error(`[better-cms] ${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
	}
	return (await res.json()) as T;
}

function whereParams(where: WhereClause | undefined, target: URLSearchParams): void {
	if (!where || typeof where !== 'object') return;
	for (const [k, v] of Object.entries(where as Record<string, unknown>)) {
		if (v != null) target.set(`where[${k}]`, String(v));
	}
}

/**
 * Returns an object exposing every collection + singleton method. Type-side,
 * the user's `CmsClient<C>` mapped type narrows each property to the right
 * shape (CollectionApi vs SingletonApi). Runtime: all methods are present on
 * every property; the type system prevents misuse, the URLs differ by route.
 */
function collectionOrSingleton(basePath: string, name: string, fetcher: typeof fetch) {
	async function list(opts?: FindManyQuery) {
		const params = new URLSearchParams();
		if (opts?.limit != null) params.set('limit', String(opts.limit));
		if (opts?.offset != null) params.set('offset', String(opts.offset));
		whereParams(opts?.where, params);
		const qs = params.toString();
		const res = await fetcher(`${basePath}/collections/${name}${qs ? `?${qs}` : ''}`);
		const body = await jsonOrThrow<{ rows: unknown[] }>(res);
		return body.rows as never;
	}
	async function find(id: string) {
		const res = await fetcher(`${basePath}/collections/${name}/${encodeURIComponent(id)}`);
		if (res.status === 404) return null;
		const body = await jsonOrThrow<{ row: unknown }>(res);
		return body.row as never;
	}
	async function count(where?: WhereClause) {
		const params = new URLSearchParams({ count: '1' });
		whereParams(where, params);
		const res = await fetcher(`${basePath}/collections/${name}?${params.toString()}`);
		const body = await jsonOrThrow<{ count: number }>(res);
		return body.count;
	}
	async function create(data: unknown) {
		const body = await opsRequest(basePath, fetcher, [
			{ op: 'create', collection: name, data: data as Record<string, unknown> },
		]);
		return (body.results[0]?.row ?? data) as never;
	}
	async function update(id: string, data: unknown) {
		const body = await opsRequest(basePath, fetcher, [
			{ op: 'set', collection: name, id, data: data as Record<string, unknown> },
		]);
		return (body.results[0]?.row ?? data) as never;
	}
	async function deleteOne(id: string) {
		await opsRequest(basePath, fetcher, [{ op: 'remove', collection: name, id }]);
	}
	async function getSingleton() {
		const res = await fetcher(`${basePath}/singletons/${name}`);
		if (res.status === 404) return null;
		const body = await jsonOrThrow<{ row: unknown }>(res);
		return body.row as never;
	}
	async function setSingleton(data: unknown) {
		const res = await fetcher(`${basePath}/singletons/${name}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(data),
		});
		const body = await jsonOrThrow<{ row: unknown }>(res);
		return body.row as never;
	}

	// `get(idOrSlug)` (collection) and `get()` (singleton) share a name. Disambiguate by argument count.
	function get(idOrSlug?: string) {
		if (idOrSlug === undefined) return getSingleton();
		return find(idOrSlug);
	}

	return {
		list,
		find,
		get,
		count,
		create,
		update,
		delete: deleteOne,
		set: setSingleton,
	};
}

async function opsRequest(
	basePath: string,
	fetcher: typeof fetch,
	ops: unknown[],
): Promise<{ results: { ok: boolean; row?: unknown; error?: { message: string } }[] }> {
	const res = await fetcher(`${basePath}/ops`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ops }),
	});
	const body = await jsonOrThrow<{
		results: { ok: boolean; row?: unknown; error?: { message: string } }[];
	}>(res);
	const failed = body.results.find((r) => !r.ok);
	if (failed) throw new Error(failed.error?.message ?? 'op failed');
	return body;
}
