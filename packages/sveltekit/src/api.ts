import { applyOps, detectSlugField, getCmsTables, opToEventType } from '@better-cms/core';
import type {
	CmsConfig,
	CmsInstance,
	CmsOp,
	CmsUser,
	CollectionDef,
	CollectionsRecord,
	FieldsRecord,
	InferRows,
	OpResult,
	RowOf,
	SchemaIR,
} from '@better-cms/core';
import type { CollectionApi, SingletonApi } from './api-client.js';
import { getCurrentRequest } from './request-context.js';
import { cms as resolveCms } from './server.js';

const SINGLETON_ID = 'default';

/** Server-side auth API. Reads the active SvelteKit request via the AsyncLocalStorage scope set by `cmsHandle`. */
export interface ServerAuthApi {
	getUser(): Promise<CmsUser | null>;
	/** Same as `getUser()` but throws when no user is signed in — saves a guard on every command. */
	requireUser(): Promise<CmsUser>;
}

export type Cms<C extends CollectionsRecord> = {
	[K in keyof C]: C[K] extends CollectionDef<FieldsRecord, 'singleton'>
		? SingletonApi<InferRows<SchemaIR<C>>[K]>
		: CollectionApi<InferRows<SchemaIR<C>>[K]>;
} & { auth: ServerAuthApi };

/**
 * Build a property-style server API from a CMS config. Lazily reuses the
 * `cms()` singleton, so this is cheap to import.
 *
 *   import { createCms } from 'better-cms/sveltekit/server';
 *   const cms = createCms(config);
 *   await cms.posts.list({ limit: 20 });
 *   await cms.posts.get('hello-world');
 *   await cms.settings.set({ siteTitle });
 *   await cms.auth.getUser();          // reads the request from cmsHandle's ALS scope
 */
export function createCms<C extends CollectionsRecord>(config: CmsConfig<C>): Cms<C> {
	const schema = getCmsTables(config);
	const out: Record<string, unknown> = { auth: serverAuth(config) };
	for (const [name, def] of Object.entries(config.collections) as [string, CollectionDef][]) {
		out[name] =
			def.kind === 'singleton'
				? singletonOps(config, schema, name)
				: collectionOps(config, schema, name);
	}
	return out as Cms<C>;
}

function serverAuth(config: CmsConfig): ServerAuthApi {
	const api: ServerAuthApi = {
		async getUser() {
			if (!config.auth) return null;
			const request = getCurrentRequest();
			if (!request) {
				throw new Error(
					'[better-cms] cms.auth.getUser() called outside a request scope. cmsHandle wraps every SvelteKit request — call from a load function or +server.ts handler.',
				);
			}
			return config.auth.getUser(request);
		},
		async requireUser() {
			const user = await api.getUser();
			if (!user) throw new Error('unauthorized');
			return user;
		},
	};
	return api;
}

function collectionOps(
	config: CmsConfig,
	schema: SchemaIR,
	name: string,
): CollectionApi<RowOf<CollectionDef>> {
	const slugField = detectSlugField(schema.collections[name]?.fields ?? {});
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

/** Apply a single op + publish a live event. Shared by every server-side mutation entry point. */
async function runOp(config: CmsConfig, schema: SchemaIR, op: CmsOp): Promise<OpResult> {
	const inst = await resolveCms(config);
	const [res] = await applyOps([op], { store: inst.context.store, schema });
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

function singletonOps(
	config: CmsConfig,
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
