import {
	type CmsConfig,
	type CollectionDef,
	type CollectionHooksIR,
	type CollectionIndexIR,
	type CollectionsRecord,
	type FieldDef,
	type PermissionsIR,
	_collection,
} from '@better-cms/core';
import { z } from 'zod';
import type { CollectionRef } from './registry.js';
import { zodToFields } from './walker.js';

interface CollectionOpts<S extends z.ZodObject> {
	schema: S;
	tableName?: string;
	indexes?: CollectionIndexIR[];
	hooks?: CollectionHooksIR;
	permissions?: PermissionsIR;
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
		permissions: opts.permissions,
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
		permissions: opts.permissions,
		timestamps: opts.timestamps ?? true,
		validation: { create, update, full },
		toJsonSchema: () => z.toJSONSchema(opts.schema),
	}) as CollectionDef<Record<string, FieldDef>, 'singleton'> & { __schema?: S };
	(def as { __schema?: S }).__schema = opts.schema;
	return def;
}

/**
 * Resolves typed relation refs (`CollectionDef` or `() => CollectionDef`) to
 * the registered string name. Throws if a target isn't in the collections map
 * — so a renamed/forgotten collection fails fast at startup, not at runtime.
 */
export function defineCMS<C extends CollectionsRecord>(config: CmsConfig<C>): CmsConfig<C> {
	const nameByDef = new Map<CollectionDef, string>();
	for (const [name, def] of Object.entries(config.collections)) {
		nameByDef.set(def as CollectionDef, name);
	}
	for (const [name, def] of Object.entries(config.collections)) {
		resolveRelations(name, def as CollectionDef, nameByDef);
	}
	return config;
}

function resolveRelations(
	collectionName: string,
	def: CollectionDef,
	nameByDef: Map<CollectionDef, string>,
): void {
	for (const [fieldName, field] of Object.entries(def.fields) as [string, FieldDef][]) {
		const r = field.relation;
		if (!r) continue;
		const t = r.target as unknown as CollectionRef | string;
		if (typeof t === 'string') continue;
		const resolved = typeof t === 'function' ? t() : t;
		const name = nameByDef.get(resolved);
		if (!name) {
			throw new Error(
				`[better-cms] ${collectionName}.${fieldName} relation target is not registered in defineCMS({ collections: ... }). Make sure the referenced collection appears in the collections map.`,
			);
		}
		field.relation = { ...r, target: name };
	}
}
