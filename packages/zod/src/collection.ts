import {
	type Access,
	type CollectionDef,
	type CollectionIndexIR,
	type FieldDef,
	type HooksIR,
	_collection,
} from '@better-cms/core';
import { z } from 'zod';
import type { CollectionRef } from './registry.js';
import { zodToFields } from './walker.js';

/**
 * Builder exposed inside `createCms({ collections: ({collection, singleton}) => ({...}) })`.
 * `Ctx` is pinned by the surrounding `createCms` call (inferred from
 * `auth.context`'s typed return), so per-collection `access` and `hooks`
 * see typed `ctx` without an explicit generic at every collection site.
 */
export interface CmsBuilder<Ctx> {
	collection<S extends z.ZodObject>(opts: {
		schema: S;
		tableName?: string;
		indexes?: CollectionIndexIR[];
		hooks?: HooksIR<Ctx, RowOfSchema<S>>;
		access?: Access<Ctx, RowOfSchema<S>>;
		timestamps?: boolean;
	}): CollectionDef<Record<string, FieldDef>, 'collection'> & { __schema?: S };
	singleton<S extends z.ZodObject>(opts: {
		schema: S;
		tableName?: string;
		hooks?: HooksIR<Ctx, RowOfSchema<S>>;
		access?: Access<Ctx, RowOfSchema<S>>;
		timestamps?: boolean;
	}): CollectionDef<Record<string, FieldDef>, 'singleton'> & { __schema?: S };
}

export function _builder<Ctx>(): CmsBuilder<Ctx> {
	return {
		collection: (opts) => collection(opts as never) as never,
		singleton: (opts) => singleton(opts as never) as never,
	};
}

type RowOfSchema<S extends z.ZodObject> = z.infer<S> & {
	id: string;
	createdAt: Date;
	updatedAt: Date;
};

interface CollectionOpts<S extends z.ZodObject> {
	schema: S;
	tableName?: string;
	indexes?: CollectionIndexIR[];
	/** Lifecycle hooks. Annotate `(hc) => { hc.ctx satisfies AppCtx; ... }` or use the global `hooks` slot on `createCms` for typed Ctx. */
	hooks?: HooksIR<any, RowOfSchema<S>>;
	/** Per-verb access policies. Annotate `(ctx: AppCtx, doc) => ...` inline to narrow ctx. */
	access?: Access<any, RowOfSchema<S>>;
	timestamps?: boolean;
}

const SYSTEM = ['id', 'createdAt', 'updatedAt'] as const;

function buildSchemas(schema: z.ZodObject) {
	const shape = (schema as unknown as { _zod: { def: { shape: Record<string, z.ZodType> } } })._zod
		.def.shape;
	const createShape: Record<string, z.ZodType> = {};
	for (const [k, v] of Object.entries(shape)) {
		if (!SYSTEM.includes(k as (typeof SYSTEM)[number])) createShape[k] = v;
	}
	const create = z.object(createShape);
	const update = create.partial().extend({ id: z.string() });
	const full = schema.partial();
	return { create, update, full };
}

/**
 * Schema-first collection builder. Walker emits the IR `fields`, while the
 * runtime `schemas.{create,update,full}` use zod's native `.omit/.partial`
 * — lossless, transforms preserved, async refines work.
 *
 * Two call shapes:
 *   collection({ schema })                         // ctx = unknown
 *   collection<AppCtx>({ schema, access, hooks })  // ctx typed as AppCtx
 *
 * In both cases `S` is inferred from `opts.schema`.
 */
export function collection<S extends z.ZodObject>(
	opts: CollectionOpts<S>,
): CollectionDef<Record<string, FieldDef>, 'collection'> & { __schema?: S } {
	const { create, update, full } = buildSchemas(opts.schema);
	const def = _collection({
		kind: 'collection',
		tableName: opts.tableName,
		fields: zodToFields(opts.schema),
		indexes: opts.indexes,
		hooks: opts.hooks,
		access: opts.access,
		timestamps: opts.timestamps ?? true,
		validation: { create, update, full },
		toJsonSchema: () => z.toJSONSchema(opts.schema),
	}) as CollectionDef<Record<string, FieldDef>, 'collection'> & { __schema?: S };
	(def as { __schema?: S }).__schema = opts.schema;
	return def;
}

/**
 * Schema-first singleton builder. Same as `collection()` but `kind: 'singleton'`.
 * Singletons are stored as a single row keyed `id: 'default'`.
 */
export function singleton<S extends z.ZodObject>(
	opts: CollectionOpts<S>,
): CollectionDef<Record<string, FieldDef>, 'singleton'> & { __schema?: S } {
	const { create, update, full } = buildSchemas(opts.schema);
	const def = _collection({
		kind: 'singleton',
		tableName: opts.tableName,
		fields: zodToFields(opts.schema),
		hooks: opts.hooks,
		access: opts.access,
		timestamps: opts.timestamps ?? true,
		validation: { create, update, full },
		toJsonSchema: () => z.toJSONSchema(opts.schema),
	}) as CollectionDef<Record<string, FieldDef>, 'singleton'> & { __schema?: S };
	(def as { __schema?: S }).__schema = opts.schema;
	return def;
}

/**
 * Internal: resolve typed relation refs to registered name strings. Used by
 * `createCms` at startup. Throws if a target isn't registered.
 */
export function _resolveRelations(collections: Record<string, CollectionDef>): void {
	const nameByDef = new Map<CollectionDef, string>();
	for (const [name, def] of Object.entries(collections)) {
		nameByDef.set(def, name);
	}
	for (const [name, def] of Object.entries(collections)) {
		for (const [fieldName, field] of Object.entries(def.fields) as [string, FieldDef][]) {
			const r = field.relation;
			if (!r) continue;
			const t = r.target as unknown as CollectionRef | string;
			if (typeof t === 'string') continue;
			const resolved = typeof t === 'function' ? t() : t;
			const targetName = nameByDef.get(resolved);
			if (!targetName) {
				throw new Error(
					`[better-cms] ${name}.${fieldName} relation target is not registered. Make sure the referenced collection appears in the collections map.`,
				);
			}
			field.relation = { ...r, target: targetName };
		}
	}
}
