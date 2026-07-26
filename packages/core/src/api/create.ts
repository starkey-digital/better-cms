import type { CmsConfig, CmsContext, CollectionsRecord } from '../config.js';
import { checkAccess } from '../handler/access.js';
import type { CollectionDef, SchemaIR } from '../ir/types.js';
import { applyOps } from '../ops/apply.js';
import type { CmsOp, OpResult } from '../ops/types.js';
import { opToEventType } from '../ops/types.js';
import type { FindManyQuery, WhereClause } from '../store/content.js';
import { CmsError, errors } from '../util/result.js';
import { detectSlugField } from '../util/slug.js';
import { deserializeRow, serializeWhere } from '../util/validate.js';
import type { CmsApi, CollectionApi, CtxResolver, SingletonApi } from './types.js';

export const SINGLETON_ID = 'default';

/** System tables are internal plumbing — never exposed through the public API or subject to user access policy. */
export function isSystemCollection(name: string): boolean {
	return name.startsWith('cms_');
}

/**
 * Build the typed API for every user-declared collection in the schema.
 *
 * This is the single implementation of "read a row" and "write a row" in
 * better-cms. The HTTP handler, the SvelteKit server instance, the CLI and
 * MCP tools all go through it, which is what keeps access checks and field
 * (de)serialization from drifting between transports.
 */
export function createCmsApi<C extends CollectionsRecord>(
	ctx: CmsContext,
	resolveCtx: CtxResolver,
): CmsApi<C> {
	const api: Record<string, unknown> = {};
	for (const [name, def] of Object.entries(ctx.schema.collections) as [string, CollectionDef][]) {
		if (isSystemCollection(name)) continue;
		api[name] =
			def.kind === 'singleton'
				? createSingletonApi(ctx, name, resolveCtx)
				: createCollectionApi(ctx, name, resolveCtx);
	}
	return api as CmsApi<C>;
}

function defOf(schema: SchemaIR, name: string): CollectionDef {
	const def = schema.collections[name];
	if (!def) throw errors.notFound(`collection "${name}"`);
	return def;
}

/**
 * Guard a read. Collection-level policies apply to `list`/`count`; `find`,
 * `get` and singleton reads additionally pass the resolved document so
 * per-document policies can inspect it.
 *
 * Note: `list` and `count` evaluate the policy once without a document, so a
 * document-dependent `read` policy cannot filter a list result — model that
 * as a `where` clause instead.
 */
async function assertRead(
	config: CmsConfig<any, any>,
	name: string,
	ctxValue: unknown,
	doc?: unknown,
): Promise<void> {
	if (await checkAccess(config, name, 'read', ctxValue, doc)) return;
	throw errors.forbidden(`${name}.read denied`);
}

export function createCollectionApi(
	ctx: CmsContext,
	name: string,
	resolveCtx: CtxResolver,
): CollectionApi<Record<string, unknown>> {
	const { config, schema, store } = ctx;
	const def = defOf(schema, name);
	const slugField = detectSlugField(def.fields);

	async function readOne(where: WhereClause): Promise<Record<string, unknown> | null> {
		const row = await store.findOne(name, serializeWhere(def, where) ?? {});
		return row ? deserializeRow(def, row) : null;
	}

	return {
		schemas: def.schemas,

		async list(query: FindManyQuery = {}) {
			await assertRead(config, name, await resolveCtx());
			const rows = await store.findMany(name, {
				...query,
				...(query.where ? { where: serializeWhere(def, query.where)! } : {}),
			});
			return rows.map((r) => deserializeRow(def, r));
		},

		async find(id) {
			const ctxValue = await resolveCtx();
			const doc = await readOne({ id });
			if (!doc) return null;
			await assertRead(config, name, ctxValue, doc);
			return doc;
		},

		async get(idOrSlug) {
			const ctxValue = await resolveCtx();
			let doc = await readOne({ id: idOrSlug });
			if (!doc && slugField) doc = await readOne({ [slugField]: idOrSlug });
			if (!doc) return null;
			await assertRead(config, name, ctxValue, doc);
			return doc;
		},

		async count(where) {
			await assertRead(config, name, await resolveCtx());
			return store.count(name, where ? serializeWhere(def, where) : undefined);
		},

		async create(data) {
			const res = await runOp(ctx, resolveCtx, {
				op: 'create',
				collection: name,
				data: data as Record<string, unknown>,
			});
			return res.row as Record<string, unknown>;
		},

		async update(id, data) {
			const res = await runOp(ctx, resolveCtx, {
				op: 'set',
				collection: name,
				id,
				data: data as Record<string, unknown>,
			});
			return res.row as Record<string, unknown>;
		},

		async delete(id) {
			await runOp(ctx, resolveCtx, { op: 'remove', collection: name, id });
		},
	};
}

export function createSingletonApi(
	ctx: CmsContext,
	name: string,
	resolveCtx: CtxResolver,
): SingletonApi<Record<string, unknown>> {
	const { config, schema, store } = ctx;
	const def = defOf(schema, name);

	return {
		schemas: def.schemas,

		async get() {
			const ctxValue = await resolveCtx();
			const row = await store.findOne(name, { id: SINGLETON_ID });
			const doc = row ? deserializeRow(def, row) : null;
			await assertRead(config, name, ctxValue, doc ?? undefined);
			return doc;
		},

		async set(data) {
			const existing = await store.findOne(name, { id: SINGLETON_ID });
			const payload = data as Record<string, unknown>;
			const op: CmsOp = existing
				? { op: 'set', collection: name, id: SINGLETON_ID, data: payload }
				: { op: 'create', collection: name, data: { ...payload, id: SINGLETON_ID } };
			const res = await runOp(ctx, resolveCtx, op);
			return res.row as Record<string, unknown>;
		},
	};
}

/**
 * Apply one op through the shared pipeline (validate → access → hooks →
 * persist) and broadcast the result. Throws on failure so callers get an
 * exception rather than an `ok: false` they might forget to check.
 */
export async function runOp(
	ctx: CmsContext,
	resolveCtx: CtxResolver,
	op: CmsOp,
): Promise<OpResult> {
	const ctxValue = await resolveCtx();
	const [res] = await applyOps([op], {
		store: ctx.store,
		schema: ctx.schema,
		config: ctx.config,
		ctx: ctxValue,
	});
	if (!res?.ok) throw opError(res, op);
	await publishLive(ctx, res);
	return res;
}

const STATUS_BY_CODE: Record<string, number> = {
	VALIDATION: 400,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	CONFLICT: 409,
};

/**
 * Re-raise a failed op as a CmsError carrying the original code, so the HTTP
 * boundary maps it to the right status. `applyOp` already formats the message
 * — rebuild the error rather than routing back through `errors.*`, whose
 * helpers would decorate it a second time.
 */
function opError(res: OpResult | undefined, op: CmsOp): Error {
	const error = res?.error;
	const message = error?.message ?? `${op.collection}.${op.op} failed`;
	const code = error?.code ?? 'INTERNAL';
	return new CmsError(message, code, STATUS_BY_CODE[code] ?? 500);
}

export async function publishLive(ctx: CmsContext, res: OpResult): Promise<void> {
	if (!res.ok || !ctx.live) return;
	await ctx.live.publish({
		type: opToEventType(res.op),
		collection: res.op.collection,
		id: res.op.id ?? (res.row?.id as string | undefined),
		at: Date.now(),
	});
}
