/**
 * Internal Representation. All adapters, generators, and editors consume this.
 * Authors never write IR by hand — DSL builders produce it.
 */

import type { StandardSchemaV1 } from '../util/standard-schema.js';

export type ScalarType = 'string' | 'number' | 'integer' | 'boolean' | 'date';
export type ColumnType = 'text' | 'integer' | 'real' | 'blob';
export type StorageHint = 'column' | 'json';

export type FieldKind =
	| 'text'
	| 'richText'
	| 'slug'
	| 'image'
	| 'file'
	| 'boolean'
	| 'number'
	| 'integer'
	| 'date'
	| 'select'
	| 'json'
	| 'array'
	| 'object'
	| 'relation';

export interface FieldEditorIR {
	component: string;
	props?: Record<string, unknown>;
}

export interface FieldLLMIR {
	describe: string;
	examples?: unknown[];
}

export interface FieldRelationIR {
	target: string;
	many: boolean;
	onDelete?: 'cascade' | 'set null' | 'restrict';
}

export interface FieldArrayIR {
	of: FieldDef<unknown>;
}

export interface FieldObjectIR {
	fields: Record<string, FieldDef<unknown>>;
}

export interface FieldDef<TOut = unknown> {
	kind: FieldKind;
	label?: string;
	description?: string;
	storage: StorageHint;
	columnType?: ColumnType;
	scalarType?: ScalarType;
	defaultValue?: unknown;
	unique?: boolean;
	indexed?: boolean;
	required?: boolean;
	/** Enum-like options for select fields. Drives admin widget, drizzle enum, ts literal types. */
	options?: ReadonlyArray<string>;
	/** Bring-your-own validator. Any Standard-Schema-compatible schema (zod, valibot, arktype, …). */
	validation?: StandardSchemaV1<unknown, TOut>;
	editor?: FieldEditorIR;
	llm?: FieldLLMIR;
	relation?: FieldRelationIR;
	array?: FieldArrayIR;
	object?: FieldObjectIR;
	/** phantom — never set at runtime; carries the typed output value for inference */
	readonly __out?: TOut;
}

export type FieldOf<F> = F extends FieldDef<infer T> ? T : never;

export interface CollectionIndexIR {
	fields: string[];
	unique?: boolean;
	name?: string;
}

export interface CollectionHooksIR {
	beforeWrite?: (ctx: HookContext) => unknown | Promise<unknown>;
	afterWrite?: (ctx: HookContext) => unknown | Promise<unknown>;
	beforeDelete?: (ctx: HookContext) => unknown | Promise<unknown>;
	afterDelete?: (ctx: HookContext) => unknown | Promise<unknown>;
}

export interface HookContext {
	collection: string;
	op: 'create' | 'update' | 'delete';
	id?: string;
	data?: Record<string, unknown>;
	user?: { id: string; [k: string]: unknown } | null;
}

export type CollectionKind = 'collection' | 'singleton';

export type FieldsRecord = Record<string, FieldDef<unknown>>;

/** Optional collection-level Standard Schema overrides per variant. */
export interface CollectionValidationOverride {
	create?: StandardSchemaV1;
	update?: StandardSchemaV1;
	full?: StandardSchemaV1;
}

/** Lazily-composed Standard Schemas attached to every collection. */
export interface CollectionSchemas {
	readonly create: StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>;
	readonly update: StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>;
	readonly full: StandardSchemaV1<Record<string, unknown>, Record<string, unknown>>;
}

export interface CollectionDef<
	F extends FieldsRecord = FieldsRecord,
	K extends CollectionKind = CollectionKind,
> {
	kind: K;
	tableName?: string;
	fields: F;
	indexes?: CollectionIndexIR[];
	hooks?: CollectionHooksIR;
	permissions?: PermissionsIR;
	timestamps?: boolean;
	/** User-supplied per-variant Standard Schema validators (zod / valibot / arktype / …). */
	validation?: CollectionValidationOverride;
	/** Resolved `create` / `update` / `full` Standard Schemas. Falls back to passthrough when no validation supplied. */
	schemas: CollectionSchemas;
	/** Optional JSON Schema generator for the `create` shape. Schema-first builders bake this from their validator. */
	toJsonSchema?: () => unknown;
	/** Phantom — schema-first builders attach this for type inference. Never read at runtime. */
	readonly __schema?: StandardSchemaV1;
}

type SchemaOutput<S> = S extends { '~standard': { types?: infer T } }
	? T extends { output: infer O }
		? O
		: never
	: never;

export type RowOf<C extends CollectionDef<any, any>> = SchemaOutput<
	NonNullable<C['__schema']>
> extends never
	? FallbackRow<C>
	: SchemaOutput<NonNullable<C['__schema']>> & {
			id: string;
			createdAt?: Date;
			updatedAt?: Date;
		};

type FallbackRow<C extends CollectionDef<any, any>> = {
	[K in keyof C['fields']]: FieldOf<C['fields'][K]>;
} & { id: string; createdAt?: Date; updatedAt?: Date };

export interface PermissionsIR {
	read?: PermissionFn;
	write?: PermissionFn;
	delete?: PermissionFn;
}

export type PermissionFn = (ctx: PermissionContext) => boolean | Promise<boolean>;

export interface PermissionContext {
	user: { id: string; [k: string]: unknown } | null;
	collection: string;
	op: 'read' | 'write' | 'delete';
	id?: string;
	data?: Record<string, unknown>;
}

/** Compiled, normalized schema. The single source of truth. */
export interface SchemaIR<
	C extends Record<string, CollectionDef<any, any>> = Record<string, CollectionDef<any, any>>,
> {
	collections: C;
}

export type InferRows<S extends SchemaIR<any>> = {
	[K in keyof S['collections']]: RowOf<S['collections'][K]>;
};
