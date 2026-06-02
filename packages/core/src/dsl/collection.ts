import type { Access } from '../auth/types.js';
import type {
	CollectionDef,
	CollectionIndexIR,
	CollectionSchemas,
	CollectionValidationOverride,
	FieldsRecord,
	HooksIR,
} from '../ir/types.js';
import type { StandardSchemaV1 } from '../util/standard-schema.js';

interface CollectionOpts<F extends FieldsRecord, K extends 'collection' | 'singleton'> {
	kind: K;
	tableName?: string;
	fields: F;
	indexes?: CollectionIndexIR[];
	hooks?: HooksIR<any, any>;
	access?: Access<any, any>;
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

const PASSTHROUGH_SCHEMAS: CollectionSchemas = {
	create: PASSTHROUGH,
	update: PASSTHROUGH,
	full: PASSTHROUGH,
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
	const { validation } = opts;
	const schemas: CollectionSchemas =
		validation?.create || validation?.update || validation?.full
			? {
					create: (validation.create as CollectionSchemas['create']) ?? PASSTHROUGH,
					update: (validation.update as CollectionSchemas['update']) ?? PASSTHROUGH,
					full: (validation.full as CollectionSchemas['full']) ?? PASSTHROUGH,
				}
			: PASSTHROUGH_SCHEMAS;
	return {
		...opts,
		timestamps: opts.timestamps ?? true,
		schemas,
	} as CollectionDef<F, K>;
}
