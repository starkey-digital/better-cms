import {
	applyOps,
	clientCmsConfig as coreClientCmsConfig,
	detectSlugField,
	getCmsTables,
	opToEventType,
} from '@better-cms/core';
import type {
	ClientCmsConfig,
	CmsConfig,
	CmsInstance,
	CmsOp,
	CollectionDef,
	CollectionsRecord,
	FieldsRecord,
	InferRows,
	OpResult,
	RowOf,
	SchemaIR,
} from '@better-cms/core';
import { _builder, _resolveRelations, type CmsBuilder } from '@better-cms/zod';
import type { CollectionApi, SingletonApi } from './api-client.js';
import { getCurrentRequest } from './request-context.js';
import { cms as resolveCms } from './server.js';

const SINGLETON_ID = 'default';

/**
 * Server-side auth API. Reads the active SvelteKit request via the
 * AsyncLocalStorage scope set by `cmsHandle`, then calls the configured
 * `auth.context(request)` provider.
 */
export interface ServerAuthApi<Ctx = unknown> {
	context(): Promise<Ctx | null>;
	requireContext(): Promise<NonNullable<Ctx>>;
}

export type Cms<C extends CollectionsRecord, Ctx = unknown> = {
	[K in keyof C]: C[K] extends CollectionDef<FieldsRecord, 'singleton'>
		? SingletonApi<InferRows<SchemaIR<C>>[K]>
		: CollectionApi<InferRows<SchemaIR<C>>[K]>;
} & {
	auth: ServerAuthApi<Ctx>;
	/** Phantom — never set at runtime; carries collection types forward to `createCmsClient<Cms>` for type extraction. */
	readonly __collections?: C;
};

/**
 * Build the CMS. Resolves relation targets, attaches typed runtime methods
 * (`cms.posts.list(...)`, `cms.auth.context()`, etc.), and returns a single
 * object that doubles as the typed config. `typeof cms` carries collections
 * and Ctx forward — re-export it as a `Cms` type and a hand-written
 * `createClientCms<Cms>(...)` lifts the same types into the browser client
 * via `import type` (erased pre-bundle).
 *
 *   import { createCms, collection, singleton } from 'better-cms/sveltekit/server';
 *
 *   const context: AuthContextFn<AppCtx> = async (req) => { ... };
 *
 *   export const cms = createCms({
 *     collections: { posts, settings },
 *     adapter: libsqlAdapter({ ... }),
 *     auth: { context },
 *     access: { create: (ctx) => ctx?.user.role === 'admin' },
 *   });
 *   export type Cms = typeof cms;
 */
export type CmsInput<C extends CollectionsRecord, Ctx> = Omit<CmsConfig<C, Ctx>, 'collections'> & {
	collections: C | ((b: CmsBuilder<Ctx>) => C);
};

export function createCms<C extends CollectionsRecord, Ctx = unknown>(
	input: CmsInput<C, Ctx>,
): Cms<C, Ctx> {
	const collections =
		typeof input.collections === 'function'
			? (input.collections as (b: CmsBuilder<Ctx>) => C)(_builder<Ctx>())
			: input.collections;
	const config: CmsConfig<C, Ctx> = { ...input, collections };
	_resolveRelations(config.collections as unknown as Record<string, CollectionDef>);
	const schema = getCmsTables(config);
	const runtime: Record<string, unknown> = { auth: serverAuth(config) };
	for (const [name, def] of Object.entries(config.collections) as [string, CollectionDef][]) {
		runtime[name] =
			def.kind === 'singleton'
				? singletonOps(config, schema, name)
				: collectionOps(config, schema, name);
	}
	Object.defineProperty(runtime, '__config', { value: config, enumerable: false });
	return runtime as Cms<C, Ctx>;
}

/**
 * Pull the original `CmsConfig` back out of a `Cms` runtime instance. Used by
 * `cmsHandle` and `clientCmsConfig` so consumers don't have to thread the
 * config object separately.
 */
export function _cmsConfigOf<C extends CollectionsRecord, Ctx>(
	cms: Cms<C, Ctx>,
): CmsConfig<C, Ctx> {
	const cfg = (cms as unknown as { __config?: CmsConfig<C, Ctx> }).__config;
	if (!cfg) {
		throw new Error('[better-cms] cms instance is missing its config — was it created via createCms()?');
	}
	return cfg;
}

/**
 * Browser-safe slice of a Cms instance — strips adapter, auth, plugins,
 * media. Pass to `<CmsAdmin config={cmsConfig} />` from a `+page.server.ts`
 * loader so the admin UI gets editor metadata without dragging server-only
 * dependencies into the client bundle.
 */
export function clientCmsConfig<C extends CollectionsRecord, Ctx = unknown>(
	cmsOrConfig: Cms<C, Ctx> | CmsConfig<C, Ctx>,
): ClientCmsConfig<C, Ctx> {
	const config = '__config' in (cmsOrConfig as object)
		? _cmsConfigOf(cmsOrConfig as Cms<C, Ctx>)
		: (cmsOrConfig as CmsConfig<C, Ctx>);
	return coreClientCmsConfig<C, Ctx>(config);
}

function serverAuth<Ctx>(config: CmsConfig<any, Ctx>): ServerAuthApi<Ctx> {
	const api: ServerAuthApi<Ctx> = {
		async context() {
			if (!config.auth) return null;
			const request = getCurrentRequest();
			if (!request) {
				throw new Error(
					'[better-cms] cms.auth.context() called outside a request scope. cmsHandle wraps every SvelteKit request — call from a load function or +server.ts handler.',
				);
			}
			return (await config.auth.context(request)) as Ctx | null;
		},
		async requireContext() {
			const ctx = await api.context();
			if (ctx == null) throw new Error('unauthorized');
			return ctx as NonNullable<Ctx>;
		},
	};
	return api;
}

// Per-request ctx cache. `cms.posts.create()` (etc.) goes through `runOp`,
// which previously re-resolved `auth.context(request)` on every op — chained
// commands in one request paid that cost N times. Cache by request reference.
const ctxByRequest = new WeakMap<Request, unknown>();

async function resolveCtx<Ctx>(config: CmsConfig<any, Ctx>): Promise<Ctx | undefined> {
	if (!config.auth) return undefined;
	const request = getCurrentRequest();
	if (!request) return undefined;
	if (ctxByRequest.has(request)) return ctxByRequest.get(request) as Ctx;
	const ctx = (await config.auth.context(request)) as Ctx;
	ctxByRequest.set(request, ctx);
	return ctx;
}

function collectionOps<Ctx>(
	config: CmsConfig<any, Ctx>,
	schema: SchemaIR,
	name: string,
): CollectionApi<RowOf<CollectionDef>> {
	const slugField = detectSlugField(schema.collections[name]?.fields ?? {});
	const def = schema.collections[name]!;
	return {
		schemas: def.schemas,
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
			if (slugField) {
				const [bySlug] = (await inst.context.store.findMany(name, {
					where: { [slugField]: idOrSlug },
					limit: 1,
				})) as RowOf<CollectionDef>[];
				if (bySlug) return bySlug;
			}
			return inst.context.store.findOne(name, {
				id: idOrSlug,
			}) as Promise<RowOf<CollectionDef> | null>;
		},
		async count(where) {
			const inst = await resolveCms(config);
			return inst.context.store.count(name, where);
		},
		async create(data) {
			const res = await runOp(config, schema, {
				op: 'create',
				collection: name,
				data: data as Record<string, unknown>,
			});
			return res.row as RowOf<CollectionDef>;
		},
		async update(id, data) {
			const res = await runOp(config, schema, {
				op: 'set',
				collection: name,
				id,
				data: data as Record<string, unknown>,
			});
			return res.row as RowOf<CollectionDef>;
		},
		async delete(id) {
			await runOp(config, schema, { op: 'remove', collection: name, id });
		},
	};
}

async function runOp<Ctx>(
	config: CmsConfig<any, Ctx>,
	schema: SchemaIR,
	op: CmsOp,
): Promise<OpResult> {
	const inst = await resolveCms(config);
	const ctx = await resolveCtx(config);
	const [res] = await applyOps([op], { store: inst.context.store, schema, config, ctx });
	if (!res?.ok) throw new Error(res?.error?.message ?? `${op.collection}.${op.op} failed`);
	await publishLive(inst, res);
	return res;
}

async function publishLive(inst: CmsInstance, res: OpResult): Promise<void> {
	if (!res.ok) return;
	await inst.live.publish({
		type: opToEventType(res.op),
		collection: res.op.collection,
		id: res.op.id ?? (res.row?.id as string | undefined),
		at: Date.now(),
	});
}

function singletonOps<Ctx>(
	config: CmsConfig<any, Ctx>,
	schema: SchemaIR,
	name: string,
): SingletonApi<RowOf<CollectionDef>> {
	return {
		async get() {
			const inst = await resolveCms(config);
			return inst.context.store.findOne(name, {
				id: SINGLETON_ID,
			}) as Promise<RowOf<CollectionDef> | null>;
		},
		async set(data) {
			const inst = await resolveCms(config);
			const existing = await inst.context.store.findOne(name, { id: SINGLETON_ID });
			const op: CmsOp = existing
				? { op: 'set', collection: name, id: SINGLETON_ID, data: data as Record<string, unknown> }
				: {
						op: 'create',
						collection: name,
						data: { ...(data as Record<string, unknown>), id: SINGLETON_ID },
					};
			const res = await runOp(config, schema, op);
			return res.row as RowOf<CollectionDef>;
		},
	};
}
