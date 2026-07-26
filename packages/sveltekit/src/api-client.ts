import type {
	CmsMeta,
	CollectionApi,
	CollectionDef,
	CollectionsRecord,
	FieldsRecord,
	FindManyQuery,
	InferRows,
	SchemaIR,
	SingletonApi,
	WhereClause,
} from '@better-cms/core';
import { normalizeBasePath } from './utils.js';

export type { CmsMeta, CmsMetaCollection, CmsMetaField } from '@better-cms/core';
export type { CollectionApi, SingletonApi } from '@better-cms/core';

export interface ClientAuthApi<Ctx = unknown> {
	context(): Promise<Ctx | null>;
	login(password: string, turnstileToken?: string): Promise<{ ok: true } | { error: string }>;
	logout(): Promise<void>;
}

/**
 * Browser-side mirror of the server `Cms` surface. The `schemas` slot is
 * server-only (it holds function refs), so client collections omit it.
 */
type ClientCollection<T> = Omit<CollectionApi<T>, 'schemas'>;

export type CmsClient<C extends CollectionsRecord, Ctx = unknown> = {
	[K in keyof C]: C[K] extends CollectionDef<FieldsRecord, 'singleton'>
		? Omit<SingletonApi<InferRows<SchemaIR<C>>[K]>, 'schemas'>
		: ClientCollection<InferRows<SchemaIR<C>>[K]>;
} & {
	auth: ClientAuthApi<Ctx>;
	/** Lazy-fetch the server's structural metadata. Cached after first call. Used by `<CmsAdmin>` to build the editor UI. */
	meta(): Promise<CmsMeta>;
	/** Upload a media asset. Returns the storage key + public URL. */
	uploadMedia(file: File | Blob, folder?: string): Promise<{ key: string; url: string }>;
	/** Effective base path the client uses for HTTP calls. */
	readonly basePath: string;
};

/**
 * Type helpers — extract collections and Ctx from the user's resolved `Cms`
 * (the value of `createCms(...)`). Type-only imports erase before bundling, so
 * a client module can `import type { Cms }` from `$lib/cms/server/cms` without
 * dragging server runtime into the browser.
 */
type CollectionsOf<T> = T extends { __collections?: infer C extends CollectionsRecord }
	? C
	: T extends { collections: infer C extends CollectionsRecord }
		? C
		: never;
type CtxOf<T> = T extends { auth: { context(): Promise<infer R | null> } }
	? R
	: T extends { auth?: { context: (req: Request) => Promise<infer R> } }
		? R
		: unknown;

export interface CreateCmsClientOpts {
	basePath?: string;
	fetch?: typeof fetch;
}

/**
 * HTTP client for the CMS endpoints. This exists for the admin UI and for
 * clients that live outside the SvelteKit server — a mobile app, another
 * service, an MCP tool. Inside a SvelteKit app, prefer the `cms` object from
 * `createCms()`: it skips the HTTP round trip and is the same implementation.
 *
 *   import type { Cms } from '$lib/cms/server/cms';
 *   export const cmsClient = createCmsClient<Cms>({ basePath: '/api/cms' });
 *
 * The Proxy dispatches collection / singleton names lazily — no manifest is
 * baked at build time.
 */
export function createCmsClient<TCms = unknown>(
	opts: CreateCmsClientOpts = {},
): CmsClient<CollectionsOf<TCms>, CtxOf<TCms>> {
	const basePath = normalizeBasePath(opts.basePath);
	const fetcher = opts.fetch ?? fetch;

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
		return jsonOrThrow<{ key: string; url: string }>(res);
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
 * the `CmsClient<C>` mapped type narrows each property to the right shape
 * (collection vs singleton); at runtime all methods are present on every
 * property and the URLs differ by route.
 */
function collectionOrSingleton(basePath: string, name: string, fetcher: typeof fetch) {
	function listQuery(opts?: FindManyQuery): string {
		const params = new URLSearchParams();
		if (opts?.limit != null) params.set('limit', String(opts.limit));
		if (opts?.offset != null) params.set('offset', String(opts.offset));
		if (opts?.orderBy?.length) {
			params.set(
				'orderBy',
				opts.orderBy.map((o) => `${o.dir === 'desc' ? '-' : ''}${o.field}`).join(','),
			);
		}
		whereParams(opts?.where, params);
		const qs = params.toString();
		return qs ? `?${qs}` : '';
	}

	async function list(opts?: FindManyQuery) {
		const res = await fetcher(`${basePath}/collections/${name}${listQuery(opts)}`);
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
