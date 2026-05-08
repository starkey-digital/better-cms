import type { CmsConfig, CmsContext } from '../config.js';
import type { CollectionDef, FieldDef, SchemaIR } from '../ir/types.js';
import { getCmsTables } from '../ir/tables.js';
import { applyOps } from '../ops/apply.js';
import { opToEventType } from '../ops/types.js';
import type { CmsOp } from '../ops/types.js';
import type { PluginEndpoint } from '../plugin/types.js';
import { CmsError, errors } from '../util/result.js';
import { detectSlugField } from '../util/slug.js';
import { coerceScalar, deserializeRow } from '../util/validate.js';
import { checkAccess } from './access.js';
import { type LiveTransport, inMemoryTransport, sseResponse } from './live.js';

const LIST_RE = /^\/collections\/([^/]+)$/;
const ONE_RE = /^\/collections\/([^/]+)\/([^/]+)$/;
const SINGLETON_RE = /^\/singletons\/([^/]+)$/;
type RouteKey = `${string} ${string}`;
export const SINGLETON_ID = 'default';

export interface CmsInstance {
	context: CmsContext;
	handler: (request: Request) => Promise<Response>;
	live: LiveTransport;
	close(): Promise<void>;
}

export interface CreateCmsOpts {
	live?: LiveTransport;
}

/**
 * Build the runtime from a config. Returns:
 *  - context (schema, store, media) for direct server-side calls (SSR loaders)
 *  - handler (Request→Response) for the HTTP boundary
 *  - live transport for SSE broadcasts
 */
export async function createCMS<C extends Record<string, any> = any, Ctx = unknown>(
	config: CmsConfig<C, Ctx>,
	opts: CreateCmsOpts = {},
): Promise<CmsInstance> {
	const schema = getCmsTables(config);
	const live = opts.live ?? inMemoryTransport();
	const context: CmsContext = {
		config,
		schema,
		store: config.adapter,
		media: config.media,
	};

	if (config.adapter.init) await config.adapter.init(schema);
	const pluginRoutes = new Map<RouteKey, PluginEndpoint>();
	for (const plugin of config.plugins ?? []) {
		if (plugin.init) await plugin.init(context);
		for (const ep of plugin.endpoints ?? []) {
			pluginRoutes.set(`${ep.method} ${ep.path}`, ep);
		}
	}

	const basePath = (config.basePath ?? '/api/cms').replace(/\/$/, '');
	// Schema is immutable per createCMS instance — compute the /_meta payload
	// once and serve the same shape on every admin mount.
	const metaPayload = buildMeta(schema, basePath);

	async function handler(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (!url.pathname.startsWith(basePath)) {
			return new Response('Not handled', { status: 404 });
		}
		const sub = url.pathname.slice(basePath.length) || '/';

		try {
			const ctx = config.auth ? await config.auth.context(request) : undefined;

			if (sub === '/_live' && request.method === 'GET') {
				return sseResponse(live);
			}

			if (sub === '/auth/context' && request.method === 'GET') {
				return Response.json({ ctx: ctx ?? null });
			}

			if (sub === '/_meta' && request.method === 'GET') {
				return Response.json(metaPayload);
			}

			if (sub === '/ops' && request.method === 'POST') {
				const body = (await request.json()) as { ops: CmsOp[] };
				const results = await applyOps(body.ops ?? [], {
					store: context.store,
					schema,
					config,
					ctx,
				});
				for (const r of results) {
					if (!r.ok) continue;
					await live.publish({
						type: opToEventType(r.op),
						collection: r.op.collection,
						id: r.op.id ?? (r.row?.id as string | undefined),
						at: Date.now(),
					});
				}
				return Response.json({ results });
			}

			if (request.method === 'GET') {
				const listMatch = LIST_RE.exec(sub);
				if (listMatch) {
					const name = listMatch[1]!;
					const def = schema.collections[name];
					if (!def) throw errors.notFound(`collection "${name}"`);
					if (def.kind === 'singleton') throw errors.badRequest(`${name} is a singleton`);
					if (!(await checkAccess(config, name, 'read', ctx))) {
						throw errors.notFound(`collection "${name}"`);
					}
					const where: Record<string, unknown> = {};
					for (const [key, value] of url.searchParams.entries()) {
						if (!key.startsWith('where[') || !key.endsWith(']')) continue;
						const field = key.slice(6, -1);
						where[field] = coerceScalar(def.fields[field], value);
					}
					const whereOrUndef = Object.keys(where).length ? where : undefined;
					if (url.searchParams.get('count') === '1') {
						const total = await context.store.count(name, whereOrUndef);
						return Response.json({ count: total });
					}
					const limit = Number(url.searchParams.get('limit') ?? '50');
					const offset = Number(url.searchParams.get('offset') ?? '0');
					const rows = await context.store.findMany(name, {
						limit,
						offset,
						...(whereOrUndef ? { where: whereOrUndef } : {}),
					});
					return Response.json({ rows: rows.map((r) => deserializeRow(def, r)) });
				}
				const oneMatch = ONE_RE.exec(sub);
				if (oneMatch) {
					const name = oneMatch[1]!;
					const idOrSlug = oneMatch[2]!;
					const def = schema.collections[name];
					if (!def) throw errors.notFound(`collection "${name}"`);
					let row = await context.store.findOne(name, { id: idOrSlug });
					if (!row) {
						const slugField = detectSlugField(def.fields);
						if (slugField) {
							const matches = await context.store.findMany(name, {
								where: { [slugField]: idOrSlug },
								limit: 1,
							});
							row = matches[0] ?? null;
						}
					}
					if (!row) throw errors.notFound(`${name}#${idOrSlug}`);
					const doc = deserializeRow(def, row);
					if (!(await checkAccess(config, name, 'read', ctx, doc))) {
						throw errors.notFound(`${name}#${idOrSlug}`);
					}
					return Response.json({ row: doc });
				}
				const singletonMatch = SINGLETON_RE.exec(sub);
				if (singletonMatch) {
					const name = singletonMatch[1]!;
					const def = schema.collections[name];
					if (!def || def.kind !== 'singleton') throw errors.notFound(`singleton "${name}"`);
					const row = await context.store.findOne(name, { id: SINGLETON_ID });
					const doc = row ? deserializeRow(def, row) : undefined;
					if (!(await checkAccess(config, name, 'read', ctx, doc))) {
						throw errors.notFound(`singleton "${name}"`);
					}
					return Response.json({ row: doc ?? null });
				}
			}

			if (request.method === 'PUT') {
				const singletonMatch = SINGLETON_RE.exec(sub);
				if (singletonMatch) {
					const name = singletonMatch[1]!;
					const def = schema.collections[name];
					if (!def || def.kind !== 'singleton') throw errors.notFound(`singleton "${name}"`);
					const body = (await request.json()) as Record<string, unknown>;
					const existing = await context.store.findOne(name, { id: SINGLETON_ID });
					const op: CmsOp = existing
						? { op: 'set', collection: name, id: SINGLETON_ID, data: body }
						: { op: 'create', collection: name, data: { ...body, id: SINGLETON_ID } };
					const [res] = await applyOps([op], {
						store: context.store,
						schema,
						config,
						ctx,
					});
					if (!res?.ok) {
						const err = res?.error;
						if (err?.code === 'FORBIDDEN') throw errors.forbidden(err.message);
						if (err?.code === 'NOT_FOUND') throw errors.notFound(err.message);
						throw errors.validation(err?.message ?? 'singleton write failed');
					}
					await live.publish({
						type: opToEventType(res.op),
						collection: name,
						id: SINGLETON_ID,
						at: Date.now(),
					});
					return Response.json({ row: res.row });
				}
			}

			const ep = pluginRoutes.get(`${request.method} ${sub}`);
			if (ep) return ep.handler(request, context);

			return new Response('Not found', { status: 404 });
		} catch (e) {
			if (e instanceof CmsError) {
				return Response.json(
					{ error: { code: e.code, message: e.message, details: e.details } },
					{ status: e.status },
				);
			}
			return Response.json(
				{ error: { code: 'INTERNAL', message: (e as Error).message ?? 'unknown' } },
				{ status: 500 },
			);
		}
	}

	return {
		context,
		handler,
		live,
		async close() {
			await context.store.close?.();
			await context.media?.close?.();
		},
	};
}

/**
 * Build the browser-safe metadata response for `GET /_meta`. Strips function
 * refs (`validation`, `schemas`, `access`, `hooks`, `toJsonSchema`,
 * `__schema`) — only static editor metadata reaches the browser.
 */
function buildMeta(
	schema: SchemaIR,
	basePath: string,
): { collections: Record<string, CmsMetaCollection>; basePath: string } {
	const out: Record<string, CmsMetaCollection> = {};
	for (const [name, def] of Object.entries(schema.collections) as [string, CollectionDef][]) {
		if (name.startsWith('cms_')) continue;
		out[name] = {
			kind: def.kind,
			fields: stripFields(def.fields),
			slugField: detectSlugField(def.fields) ?? null,
		};
	}
	return { collections: out, basePath };
}

export interface CmsMetaCollection {
	kind: 'collection' | 'singleton';
	fields: Record<string, CmsMetaField>;
	slugField: string | null;
}

export interface CmsMetaField {
	kind: string;
	storage: string;
	scalarType?: string;
	required?: boolean;
	options?: ReadonlyArray<string>;
	editor?: { component: string; props?: Record<string, unknown> };
	array?: { of: CmsMetaField };
	object?: { fields: Record<string, CmsMetaField> };
	relation?: { target: string; many: boolean };
}

export interface CmsMeta {
	collections: Record<string, CmsMetaCollection>;
	basePath: string;
}

function stripFields(fields: Record<string, FieldDef>): Record<string, CmsMetaField> {
	const out: Record<string, CmsMetaField> = {};
	for (const [name, f] of Object.entries(fields)) {
		out[name] = stripField(f);
	}
	return out;
}

function stripField(f: FieldDef): CmsMetaField {
	const m: CmsMetaField = {
		kind: f.kind,
		storage: f.storage,
	};
	if (f.scalarType) m.scalarType = f.scalarType;
	if (f.required !== undefined) m.required = f.required;
	if (f.options) m.options = f.options;
	if (f.editor) m.editor = f.editor;
	if (f.array) m.array = { of: stripField(f.array.of as FieldDef) };
	if (f.object) m.object = { fields: stripFields(f.object.fields as Record<string, FieldDef>) };
	if (f.relation) m.relation = { target: f.relation.target, many: f.relation.many };
	return m;
}
