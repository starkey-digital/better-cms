import { SINGLETON_ID, createCmsApi, isSystemCollection } from '../api/create.js';
import type { CmsApi, CollectionApi, SingletonApi } from '../api/types.js';
import type { CmsConfig, CmsContext, MediaAccessConfig } from '../config.js';
import { DEFAULT_MAX_UPLOAD_BYTES, DEFAULT_UPLOAD_MIME_TYPES } from '../config.js';
import { getCmsTables } from '../ir/tables.js';
import type { CollectionDef, FieldDef, SchemaIR } from '../ir/types.js';
import { applyOps } from '../ops/apply.js';
import type { CmsOp, OpResult } from '../ops/types.js';
import { opToEventType } from '../ops/types.js';
import type { PluginEndpoint } from '../plugin/types.js';
import { generateId } from '../util/id.js';
import { contentKey } from '../util/media-key.js';
import { CmsError, errors } from '../util/result.js';
import { detectSlugField } from '../util/slug.js';
import { coerceScalar } from '../util/validate.js';
import { type LiveTransport, inMemoryTransport, sseResponse } from './live.js';

const LIST_RE = /^\/collections\/([^/]+)$/;
const ONE_RE = /^\/collections\/([^/]+)\/([^/]+)$/;
const SINGLETON_RE = /^\/singletons\/([^/]+)$/;
type RouteKey = `${string} ${string}`;

export { SINGLETON_ID };

export interface CmsInstance<C extends Record<string, any> = any> {
	context: CmsContext;
	/**
	 * Build the typed API bound to a resolved auth context. Pass the context
	 * for the current request; omit it outside a request (access policies then
	 * see `undefined`, the same as an unauthenticated caller).
	 */
	api(ctx?: unknown): CmsApi<C>;
	handler: (request: Request) => Promise<Response>;
	live: LiveTransport;
	close(): Promise<void>;
}

export interface CreateCmsOpts {
	live?: LiveTransport;
}

/**
 * Build the runtime from a config. The returned `handler` is a thin HTTP
 * adapter over `api()` — it parses the request, delegates, and formats the
 * response. It deliberately holds no read or write logic of its own, so HTTP
 * callers and in-process callers cannot drift apart on access checks or on
 * how stored values are decoded.
 */
export async function createCMS<C extends Record<string, any> = any, Ctx = unknown>(
	config: CmsConfig<C, Ctx>,
	opts: CreateCmsOpts = {},
): Promise<CmsInstance<C>> {
	const schema = getCmsTables(config);
	const live = opts.live ?? inMemoryTransport();
	const context: CmsContext = {
		config,
		schema,
		store: config.adapter,
		media: config.media,
		live,
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

	const api = (ctx?: unknown): CmsApi<C> => createCmsApi<C>(context, () => ctx);

	function collectionApi(ctx: unknown, name: string): CollectionApi<Record<string, unknown>> {
		const def = isSystemCollection(name) ? undefined : schema.collections[name];
		if (!def) throw errors.notFound(`collection "${name}"`);
		if (def.kind === 'singleton') throw errors.badRequest(`${name} is a singleton`);
		return (api(ctx) as Record<string, CollectionApi<Record<string, unknown>>>)[name]!;
	}

	function singletonApi(ctx: unknown, name: string): SingletonApi<Record<string, unknown>> {
		const def = isSystemCollection(name) ? undefined : schema.collections[name];
		if (!def || def.kind !== 'singleton') throw errors.notFound(`singleton "${name}"`);
		return (api(ctx) as Record<string, SingletonApi<Record<string, unknown>>>)[name]!;
	}

	async function handleList(url: URL, name: string, ctx: unknown): Promise<Response> {
		const col = collectionApi(ctx, name);
		const where = parseWhere(url, schema.collections[name]!);
		if (url.searchParams.get('count') === '1') {
			return Response.json({ count: await col.count(where) });
		}
		const rows = await col.list({
			limit: Number(url.searchParams.get('limit') ?? '50'),
			offset: Number(url.searchParams.get('offset') ?? '0'),
			...(where ? { where } : {}),
			...parseOrderBy(url),
		});
		return Response.json({ rows });
	}

	async function handleOne(name: string, idOrSlug: string, ctx: unknown): Promise<Response> {
		const row = await collectionApi(ctx, name).get(idOrSlug);
		if (!row) throw errors.notFound(`${name}#${idOrSlug}`);
		return Response.json({ row });
	}

	async function handleSingletonGet(name: string, ctx: unknown): Promise<Response> {
		return Response.json({ row: (await singletonApi(ctx, name).get()) ?? null });
	}

	async function handleSingletonPut(
		request: Request,
		name: string,
		ctx: unknown,
	): Promise<Response> {
		const body = (await request.json()) as Record<string, unknown>;
		return Response.json({ row: await singletonApi(ctx, name).set(body) });
	}

	/**
	 * Batch op endpoint. Unlike the other routes this reports per-op results
	 * instead of throwing, so a partially-successful batch still tells the
	 * caller which entries landed.
	 */
	async function handleOps(request: Request, ctx: unknown): Promise<Response> {
		const body = (await request.json()) as { ops: CmsOp[] };
		const submitted = body.ops ?? [];
		const allowed = submitted.filter((op) => !isSystemCollection(op.collection));
		const applied = await applyOps(allowed, { store: context.store, schema, config, ctx });

		// Results stay index-aligned with the submitted ops. Silently dropping
		// the rejected ones would shift every later result onto the wrong op,
		// and a fully-rejected batch would return `[]`, which reads as success.
		const byOp = new Map(applied.map((r) => [r.op, r]));
		const results: OpResult[] = submitted.map(
			(op) =>
				byOp.get(op) ?? {
					op,
					ok: false,
					error: { code: 'FORBIDDEN', message: `collection "${op.collection}" is not writable` },
				},
		);

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

	/**
	 * Media upload.
	 *
	 * Authorization comes from the dedicated `mediaAccess.upload` policy and
	 * defaults to deny. It is deliberately not inferred from collection
	 * `create` policies: permission to submit a comment says nothing about
	 * permission to write arbitrary bytes into the asset bucket, and equating
	 * them would turn any publicly-writable collection into open file hosting.
	 *
	 * The access check runs before the store check so an anonymous caller
	 * cannot probe whether media is configured.
	 */
	async function handleMediaPost(request: Request, ctx: unknown): Promise<Response> {
		const upload = config.mediaAccess?.upload as
			| ((ctx: unknown) => boolean | Promise<boolean>)
			| undefined;
		if (!upload || !(await upload(ctx))) throw errors.forbidden('media upload denied');

		const media = context.media;
		if (!media) throw errors.badRequest('media store not configured');

		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof Blob)) throw errors.badRequest('expected a "file" field');
		assertUploadAllowed(config.mediaAccess as MediaAccessConfig | undefined, file);

		const folder = form.get('folder');
		const mime = file.type || 'application/octet-stream';
		// Read once and address the object by its content hash. Uploads become
		// idempotent: a client retrying after a failure overwrites the same key
		// instead of stranding another copy, and the same asset uploaded twice
		// occupies one object. Safe to buffer — `assertUploadAllowed` has
		// already capped the size.
		const bytes = new Uint8Array(await file.arrayBuffer());
		const object = await media.put(bytes, {
			key: await contentKey(bytes, mime, typeof folder === 'string' ? folder : undefined),
			mime,
		});

		// The blob is durable at this point but the row that makes it
		// discoverable is not. If the insert fails, delete the object rather
		// than leaving one nothing references. Content addressing bounds the
		// damage when even that fails — repeated retries strand one object, not
		// one per attempt — and `bcms media:gc` reclaims whatever is left.
		try {
			await context.store.create('cms_media', {
				id: generateId(),
				key: object.key,
				url: object.url,
				mime: object.mime,
				size: object.size,
				width: object.width ?? null,
				height: object.height ?? null,
				alt: null,
				createdAt: Date.now(),
			});
		} catch (e) {
			try {
				await media.delete(object.key);
			} catch (cleanupError) {
				// Surface the key: the object outlived the request and only a
				// human (or a sweeper) can reclaim it now.
				console.error(
					`[better-cms] uploaded object "${object.key}" was orphaned — its metadata insert failed and the cleanup delete also failed:`,
					cleanupError,
				);
			}
			throw e;
		}

		return Response.json(object);
	}

	async function routeRequest(
		request: Request,
		url: URL,
		sub: string,
		ctx: unknown,
	): Promise<Response> {
		if (sub === '/_live' && request.method === 'GET') return sseResponse(live);
		if (sub === '/auth/context' && request.method === 'GET')
			return Response.json({ ctx: ctx ?? null });
		if (sub === '/_meta' && request.method === 'GET') return Response.json(metaPayload);
		if (sub === '/ops' && request.method === 'POST') return handleOps(request, ctx);
		if (sub === '/media' && request.method === 'POST') return handleMediaPost(request, ctx);

		if (request.method === 'GET') {
			const list = LIST_RE.exec(sub);
			if (list) return maskDenied(() => handleList(url, list[1]!, ctx));
			const one = ONE_RE.exec(sub);
			if (one) return maskDenied(() => handleOne(one[1]!, one[2]!, ctx));
			const single = SINGLETON_RE.exec(sub);
			if (single) return maskDenied(() => handleSingletonGet(single[1]!, ctx));
		}

		if (request.method === 'PUT') {
			const single = SINGLETON_RE.exec(sub);
			if (single) return handleSingletonPut(request, single[1]!, ctx);
		}

		const ep = pluginRoutes.get(`${request.method} ${sub}`);
		if (ep) return ep.handler(request, context);

		return new Response('Not found', { status: 404 });
	}

	async function handler(request: Request): Promise<Response> {
		const url = new URL(request.url);
		if (!url.pathname.startsWith(basePath)) {
			return new Response('Not handled', { status: 404 });
		}
		const sub = url.pathname.slice(basePath.length) || '/';

		try {
			const ctx = config.auth ? await config.auth.context(request) : undefined;
			return await routeRequest(request, url, sub, ctx);
		} catch (e) {
			return errorResponse(e);
		}
	}

	return {
		context,
		api,
		handler,
		live,
		async close() {
			await context.store.close?.();
			await context.media?.close?.();
		},
	};
}

/**
 * Rewrite a policy-denied read as "not found", so the API never confirms the
 * existence of records the caller may not see.
 *
 * Applied per-route rather than to every error: a plugin endpoint that throws
 * `forbidden('not logged in')` means exactly that, and masking it would leave
 * its callers unable to tell "authenticate" from "gone". Writes report 403
 * honestly too — the caller already knows what it tried to write.
 */
async function maskDenied(run: () => Promise<Response>): Promise<Response> {
	try {
		return await run();
	} catch (e) {
		if (e instanceof CmsError && e.code === 'FORBIDDEN') throw errors.notFound('resource');
		throw e;
	}
}

function errorResponse(e: unknown): Response {
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

/**
 * Enforce the configured size and MIME limits. Both default to something
 * restrictive: an upload endpoint with no ceiling is a storage-cost and
 * arbitrary-file-hosting problem, and defaults only help if they apply when
 * the operator has not thought about it.
 */
function assertUploadAllowed(media: MediaAccessConfig | undefined, file: Blob): void {
	const maxBytes = media?.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
	if (maxBytes > 0 && file.size > maxBytes) {
		throw errors.badRequest(`file is ${file.size} bytes; the limit is ${maxBytes}`);
	}

	const allowed = media?.mimeTypes ?? DEFAULT_UPLOAD_MIME_TYPES;
	if (allowed.length === 0) return;
	const mime = file.type || 'application/octet-stream';
	const ok = allowed.some((pattern) =>
		pattern.endsWith('/*') ? mime.startsWith(pattern.slice(0, -1)) : pattern === mime,
	);
	if (!ok) throw errors.badRequest(`mime type "${mime}" is not accepted`);
}

function parseWhere(url: URL, def: CollectionDef): Record<string, unknown> | undefined {
	const where: Record<string, unknown> = {};
	for (const [key, value] of url.searchParams.entries()) {
		if (!key.startsWith('where[') || !key.endsWith(']')) continue;
		const field = key.slice(6, -1);
		where[field] = coerceScalar(def.fields[field], value);
	}
	return Object.keys(where).length ? where : undefined;
}

/** `?orderBy=-createdAt,title` → newest first, then title ascending. */
function parseOrderBy(url: URL): { orderBy?: { field: string; dir?: 'asc' | 'desc' }[] } {
	const raw = url.searchParams.get('orderBy');
	if (!raw) return {};
	const orderBy = raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) =>
			part.startsWith('-')
				? { field: part.slice(1), dir: 'desc' as const }
				: { field: part, dir: 'asc' as const },
		);
	return orderBy.length ? { orderBy } : {};
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
		if (isSystemCollection(name)) continue;
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
