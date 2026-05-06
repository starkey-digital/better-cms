import type {
	CollectionDef,
	CollectionHooksIR,
	CollectionIndexIR,
	FieldsRecord,
	PermissionsIR,
} from '../ir/types.js';

interface CollectionOpts<F extends FieldsRecord> {
	tableName?: string;
	fields: F;
	indexes?: CollectionIndexIR[];
	hooks?: CollectionHooksIR;
	permissions?: PermissionsIR;
	timestamps?: boolean;
}

export function collection<F extends FieldsRecord>(
	opts: CollectionOpts<F>,
): CollectionDef<F, 'collection'> {
	return {
		kind: 'collection',
		tableName: opts.tableName,
		fields: opts.fields,
		indexes: opts.indexes,
		hooks: opts.hooks,
		permissions: opts.permissions,
		timestamps: opts.timestamps ?? true,
	};
}

export function singleton<F extends FieldsRecord>(
	opts: CollectionOpts<F>,
): CollectionDef<F, 'singleton'> {
	return {
		kind: 'singleton',
		tableName: opts.tableName,
		fields: opts.fields,
		hooks: opts.hooks,
		permissions: opts.permissions,
		timestamps: opts.timestamps ?? true,
	};
}
