/**
 * Internal Representation. All adapters, generators, and editors consume this.
 * Authors never write IR by hand — DSL builders produce it.
 */

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

export interface FieldValidationIR {
	required?: boolean;
	min?: number;
	max?: number;
	pattern?: string;
	enum?: ReadonlyArray<string | number>;
}

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
	min?: number;
	max?: number;
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
	validation?: FieldValidationIR;
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
}

export type RowOf<C extends CollectionDef<any, any>> = {
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
