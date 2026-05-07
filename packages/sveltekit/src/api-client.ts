import type {
	ClientCmsConfig,
	CollectionDef,
	CollectionsRecord,
	FieldsRecord,
	FindManyQuery,
	InferRows,
	RowOf,
	SchemaIR,
	WhereClause,
} from '@better-cms/core';

export interface CollectionApi<T> {
	list(opts?: FindManyQuery): Promise<T[]>;
	find(id: string): Promise<T | null>;
	/** Look up by id, falling back to the collection's slug field if it has one. */
	get(idOrSlug: string): Promise<T | null>;
	count(where?: WhereClause): Promise<number>;
}

export interface SingletonApi<T> {
	get(): Promise<T | null>;
	set(data: Partial<T>): Promise<T>;
}

export interface ClientAuthApi {
	getUser(): Promise<{ id: string; role: string } | null>;
	login(password: string, turnstileToken?: string): Promise<{ ok: true } | { error: string }>;
	logout(): Promise<void>;
}

export type CmsClient<C extends CollectionsRecord> = {
	[K in keyof C]: C[K] extends CollectionDef<FieldsRecord, 'singleton'>
		? SingletonApi<InferRows<SchemaIR<C>>[K]>
		: CollectionApi<InferRows<SchemaIR<C>>[K]>;
} & { auth: ClientAuthApi };

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

/**
 * Build a property-style API that talks to the CMS over HTTP. Browser-safe —
 * no Node imports. During SSR, swaps in the request-scoped `event.fetch`
 * registered by `better-cms/sveltekit/server` so relative URLs resolve.
 * Pair with the generated `cmsClient` from `bcms generate --target=client`
 * for the zero-boilerplate path.
 */
export function createCmsClient<C extends Record<string, CollectionDef>>(
	clientConfig: ClientCmsConfig<C>,
	fetcher: typeof fetch = fetch,
): CmsClient<C extends CollectionsRecord ? C : CollectionsRecord> {
	const basePath = (clientConfig.basePath ?? '/api/cms').replace(/\/$/, '');
	const wrappedFetch = ssrAwareFetch(fetcher);
	const out: Record<string, unknown> = { auth: clientAuth(basePath, wrappedFetch) };
	for (const [name, def] of Object.entries(clientConfig.collections) as [string, ClientDef][]) {
		out[name] =
			def.kind === 'singleton'
				? clientSingleton(basePath, name, wrappedFetch)
				: clientCollection(basePath, name, def.slugField, wrappedFetch);
	}
	return out as never;
}

interface ClientDef {
	kind: CollectionDef['kind'];
	slugField?: string;
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
		async getUser() {
			const res = await fetcher(`${basePath}/me`);
			if (!res.ok) return null;
			const body = (await res.json()) as { user: { id: string; role: string } | null };
			return body.user;
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

function clientCollection(
	basePath: string,
	name: string,
	slugField: string | undefined,
	fetcher: typeof fetch,
): CollectionApi<RowOf<CollectionDef>> {
	return {
		async list(opts) {
			const params = new URLSearchParams();
			if (opts?.limit != null) params.set('limit', String(opts.limit));
			if (opts?.offset != null) params.set('offset', String(opts.offset));
			whereParams(opts?.where, params);
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
			// Prefer slug when the collection has a slug field — keeps the common
			// URL-param case out of the 404 path. Skip the slug round-trip
			// entirely when the collection has no slug.
			if (slugField) {
				const bySlug = await this.list({ limit: 1, where: { [slugField]: idOrSlug } });
				if (bySlug[0]) return bySlug[0];
			}
			return this.find(idOrSlug);
		},
		async count(where) {
			const params = new URLSearchParams({ count: '1' });
			whereParams(where, params);
			const res = await fetcher(`${basePath}/collections/${name}?${params.toString()}`);
			const body = await jsonOrThrow<{ count: number }>(res);
			return body.count;
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
