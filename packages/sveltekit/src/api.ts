import type {
	CmsApi,
	CmsConfig,
	CollectionApi,
	CollectionDef,
	CollectionsRecord,
	CreateCmsOpts,
	SingletonApi,
} from '@better-cms/core';
import { createCmsApi } from '@better-cms/core';
import { type CmsBuilder, _builder, _resolveRelations } from '@better-cms/zod';
import { cmsInstance } from './instance.js';
import { resolveRequestCtx } from './request.js';

/**
 * Server-side auth API. Reads the active SvelteKit request via
 * `getRequestEvent()`, then calls the configured `auth.context(request)`.
 */
export interface ServerAuthApi<Ctx = unknown> {
	context(): Promise<Ctx | null>;
	requireContext(): Promise<NonNullable<Ctx>>;
}

/** Slot carrying the original config. A Symbol so it can never collide with a collection name. */
const CONFIG = Symbol.for('better-cms.config');

export type Cms<C extends CollectionsRecord, Ctx = unknown> = CmsApi<C> & {
	auth: ServerAuthApi<Ctx>;
	/** Phantom — never set at runtime; carries collection types forward to `createCmsClient<Cms>`. */
	readonly __collections?: C;
};

export type CmsInput<C extends CollectionsRecord, Ctx> = Omit<CmsConfig<C, Ctx>, 'collections'> & {
	collections: C | ((b: CmsBuilder<Ctx>) => C);
	/** Advanced: swap the live-event transport (e.g. Redis) for multi-instance deploys. */
	runtime?: CreateCmsOpts;
};

/**
 * Build the CMS. Returns the typed API surface — `cms.posts.list()`,
 * `cms.settings.get()`, `cms.auth.context()` — backed by core's single
 * implementation, so these calls enforce the same access policies and return
 * the same decoded shapes as the HTTP endpoints.
 *
 *   // src/lib/cms/server/cms.ts
 *   export const cms = createCms({
 *     collections: ({ collection, singleton }) => ({ posts, settings }),
 *     adapter: libsqlAdapter({ url: process.env.DATABASE_URL! }),
 *     auth: { context },
 *     access: { create: (ctx) => ctx?.user.role === 'admin' },
 *   });
 *   export type Cms = typeof cms;
 *
 * The CMS boots lazily on first use, so this is safe to call at module scope.
 */
export function createCms<C extends CollectionsRecord, Ctx = unknown>(
	input: CmsInput<C, Ctx>,
): Cms<C, Ctx> {
	const { runtime, ...rest } = input;
	const collections =
		typeof input.collections === 'function'
			? (input.collections as (b: CmsBuilder<Ctx>) => C)(_builder<Ctx>())
			: input.collections;
	const config = { ...rest, collections } as CmsConfig<C, Ctx>;
	_resolveRelations(config.collections as unknown as Record<string, CollectionDef>);

	const api = cmsInstance(config, runtime).then((inst) =>
		createCmsApi<C>(inst.context, () => resolveRequestCtx(config)),
	);

	const cms: Record<string, unknown> = { auth: serverAuth(config) };
	for (const [name, def] of Object.entries(config.collections) as [string, CollectionDef][]) {
		cms[name] =
			def.kind === 'singleton' ? deferSingleton(api, name, def) : deferCollection(api, name, def);
	}
	Object.defineProperty(cms, CONFIG, { value: config, enumerable: false });
	return cms as Cms<C, Ctx>;
}

/**
 * Pull the original `CmsConfig` back out of a `Cms`. Lets `cmsHandle(cms)`
 * take the same object the user already exported instead of making them
 * thread the config separately.
 */
export function _cmsConfigOf<C extends CollectionsRecord, Ctx>(
	cms: Cms<C, Ctx>,
): CmsConfig<C, Ctx> {
	const config = (cms as unknown as Record<symbol, CmsConfig<C, Ctx> | undefined>)[CONFIG];
	if (!config) {
		throw new Error(
			'[better-cms] cms instance is missing its config — was it created via createCms()?',
		);
	}
	return config;
}

/** True when the argument is a `Cms` runtime instance rather than a raw `CmsConfig`. */
export function isCmsInstance<C extends CollectionsRecord, Ctx>(
	x: Cms<C, Ctx> | CmsConfig<C, Ctx>,
): x is Cms<C, Ctx> {
	return CONFIG in (x as object);
}

function serverAuth<Ctx>(config: CmsConfig<any, Ctx>): ServerAuthApi<Ctx> {
	const api: ServerAuthApi<Ctx> = {
		async context() {
			if (!config.auth) return null;
			return (await resolveRequestCtx(config)) ?? null;
		},
		async requireContext() {
			const ctx = await api.context();
			if (ctx == null) throw new Error('unauthorized');
			return ctx as NonNullable<Ctx>;
		},
	};
	return api;
}

/**
 * The CMS boots asynchronously (the adapter may create tables), but users
 * export `cms` at module scope and call it from load functions. These thin
 * wrappers await the boot on first use and forward to core's API — no read or
 * write behaviour is reimplemented here.
 */
type ApiPromise<C extends CollectionsRecord> = Promise<CmsApi<C>>;

function deferCollection<C extends CollectionsRecord>(
	api: ApiPromise<C>,
	name: string,
	def: CollectionDef,
): CollectionApi<Record<string, unknown>> {
	const target = async () =>
		(await api)[name as keyof CmsApi<C>] as unknown as CollectionApi<Record<string, unknown>>;
	return {
		schemas: def.schemas,
		list: async (query) => (await target()).list(query),
		find: async (id) => (await target()).find(id),
		get: async (idOrSlug) => (await target()).get(idOrSlug),
		count: async (where) => (await target()).count(where),
		create: async (data) => (await target()).create(data),
		update: async (id, data) => (await target()).update(id, data),
		delete: async (id) => (await target()).delete(id),
	};
}

function deferSingleton<C extends CollectionsRecord>(
	api: ApiPromise<C>,
	name: string,
	def: CollectionDef,
): SingletonApi<Record<string, unknown>> {
	const target = async () =>
		(await api)[name as keyof CmsApi<C>] as unknown as SingletonApi<Record<string, unknown>>;
	return {
		schemas: def.schemas,
		get: async () => (await target()).get(),
		set: async (data) => (await target()).set(data),
	};
}
