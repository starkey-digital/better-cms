import type {
	CollectionDef,
	CollectionHooksIR,
	CollectionIndexIR,
	CollectionSchemas,
	CollectionValidationOverride,
	FieldsRecord,
	PermissionsIR,
} from '../ir/types.js';
import type { StandardSchemaV1 } from '../util/standard-schema.js';

interface CollectionOpts<F extends FieldsRecord, K extends 'collection' | 'singleton'> {
	kind: K;
	tableName?: string;
	fields: F;
	indexes?: CollectionIndexIR[];
	hooks?: CollectionHooksIR;
	permissions?: PermissionsIR;
	timestamps?: boolean;
	/** Standard Schema validators per variant. Schema-first builders supply these. */
	validation?: CollectionValidationOverride;
	/** Optional JSON Schema generator (e.g. baked from zod's `z.toJSONSchema(schema)`). */
	toJsonSchema?: () => unknown;
}

/**
 * No-op Standard Schema. Used as a fallback for system collections that have
 * no user-supplied validators — accepts any object input verbatim.
 */
const PASSTHROUGH: StandardSchemaV1<Record<string, unknown>, Record<string, unknown>> = {
	'~standard': {
		version: 1,
		vendor: 'better-cms',
		validate: (value) => ({ value: value as Record<string, unknown> }),
	},
};

/**
 * Low-level collection primitive. Schema-first builders (e.g. `@better-cms/zod`)
 * call this internally after their walker emits IR fields and their
 * adapter-native schemas. Direct callers (system collections inside core)
 * may omit `validation` — `schemas.{create,update,full}` then resolve to
 * a passthrough that accepts any object.
 */
export function _collection<F extends FieldsRecord, K extends 'collection' | 'singleton'>(
	opts: CollectionOpts<F, K>,
): CollectionDef<F, K> {
	const validation = opts.validation;
	const schemas: CollectionSchemas = {
		create: (validation?.create as CollectionSchemas['create']) ?? PASSTHROUGH,
		update: (validation?.update as CollectionSchemas['update']) ?? PASSTHROUGH,
		full: (validation?.full as CollectionSchemas['full']) ?? PASSTHROUGH,
	};
	return {
		kind: opts.kind,
		tableName: opts.tableName,
		fields: opts.fields,
		indexes: opts.indexes,
		hooks: opts.hooks,
		permissions: opts.permissions,
		timestamps: opts.timestamps ?? true,
		validation,
		schemas,
		toJsonSchema: opts.toJsonSchema,
	} as CollectionDef<F, K>;
}
