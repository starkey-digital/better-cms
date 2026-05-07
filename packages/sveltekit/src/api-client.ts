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
	/** Look up by id first, then by `slug` field if the collection has one. */
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
 * Build a property-style API that talks to the CMS over HTTP. Browser-safe —
 * no Node imports. During SSR (no `window`), automatically swaps in
 * `event.fetch` from SvelteKit's current request so relative URLs resolve
 * correctly. Pair with the generated `cmsClient` from `bcms generate
 * --target=client` for the zero-boilerplate path.
 */
export function createCmsClient<C extends Record<string, CollectionDef>>(
	clientConfig: ClientCmsConfig<C>,
	fetcher: typeof fetch = fetch,
): CmsClient<C extends CollectionsRecord ? C : CollectionsRecord> {
	const basePath = (clientConfig.basePath ?? '/api/cms').replace(/\/$/, '');
	const wrappedFetch = ssrAwareFetch(fetcher);
	const out: Record<string, unknown> = { auth: clientAuth(basePath, wrappedFetch) };
	for (const [name, def] of Object.entries(clientConfig.collections) as [string, CollectionDef][]) {
		out[name] =
			def.kind === 'singleton'
				? clientSingleton(basePath, name, wrappedFetch)
				: clientCollection(basePath, name, wrappedFetch);
	}
	return out as never;
}

/**
 * On the server, SvelteKit's global `fetch` rejects relative URLs — callers
 * are expected to use `event.fetch`. We pull the current request event from
 * `@sveltejs/kit/internal/server` (set by SvelteKit's own AsyncLocalStorage
 * around every request) and use its `fetch` instead. In the browser we
 * just delegate to the supplied fetcher.
 */
function ssrAwareFetch(fetcher: typeof fetch): typeof fetch {
	if (typeof window !== 'undefined') return fetcher;
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		try {
			const path = '@sveltejs/kit/internal/server';
			const mod = (await import(/* @vite-ignore */ path)) as {
				getRequestEvent?: () => { fetch: typeof fetch };
			};
			if (mod.getRequestEvent) return mod.getRequestEvent().fetch(input as never, init);
		} catch {
			// fall through to global fetcher — will likely fail on relative URLs
		}
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
			if (opts?.where && typeof opts.where === 'object') {
				for (const [k, v] of Object.entries(opts.where as Record<string, unknown>)) {
					if (v != null) params.set(`where[${k}]`, String(v));
				}
			}
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
			// Prefer slug lookup when available — keeps the common URL-param case
			// out of the 404 path and avoids a console error per render.
			const bySlug = await this.list({ limit: 1, where: { slug: idOrSlug } });
			if (bySlug[0]) return bySlug[0];
			return this.find(idOrSlug);
		},
		async count(_where) {
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
