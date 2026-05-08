import type {
	CollectionDef,
	CollectionHooksIR,
	CollectionIndexIR,
	CollectionValidationOverride,
	FieldsRecord,
	PermissionsIR,
} from '../ir/types.js';
import { attachSchemas } from '../util/compose-schema.js';

interface CollectionOpts<F extends FieldsRecord> {
	tableName?: string;
	fields: F;
	indexes?: CollectionIndexIR[];
	hooks?: CollectionHooksIR;
	permissions?: PermissionsIR;
	timestamps?: boolean;
	/** Optional Standard Schema overrides per variant. Replaces the auto-composed schema. */
	validation?: CollectionValidationOverride;
}

export function collection<F extends FieldsRecord>(
	opts: CollectionOpts<F>,
): CollectionDef<F, 'collection'> {
	return attachSchemas({
		kind: 'collection' as const,
		tableName: opts.tableName,
		fields: opts.fields,
		indexes: opts.indexes,
		hooks: opts.hooks,
		permissions: opts.permissions,
		timestamps: opts.timestamps ?? true,
		validation: opts.validation,
	}) as CollectionDef<F, 'collection'>;
}

export function singleton<F extends FieldsRecord>(
	opts: CollectionOpts<F>,
): CollectionDef<F, 'singleton'> {
	return attachSchemas({
		kind: 'singleton' as const,
		tableName: opts.tableName,
		fields: opts.fields,
		hooks: opts.hooks,
		permissions: opts.permissions,
		timestamps: opts.timestamps ?? true,
		validation: opts.validation,
	}) as CollectionDef<F, 'singleton'>;
}
