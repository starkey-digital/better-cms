import type { CmsConfig, CollectionsRecord } from '../config.js';
import type { CollectionDef, SchemaIR } from './types.js';

const SYSTEM_COLLECTIONS: Record<string, CollectionDef> = {
	cms_revisions: {
		kind: 'collection',
		fields: {
			id: { kind: 'text', storage: 'column', columnType: 'text' },
			collection: { kind: 'text', storage: 'column', columnType: 'text' },
			recordId: { kind: 'text', storage: 'column', columnType: 'text' },
			payload: { kind: 'json', storage: 'column', columnType: 'text' },
			actor: { kind: 'text', storage: 'column', columnType: 'text' },
			source: { kind: 'text', storage: 'column', columnType: 'text' },
			createdAt: { kind: 'date', storage: 'column', columnType: 'integer' },
		},
		indexes: [{ fields: ['collection', 'recordId'] }],
	},
	cms_media: {
		kind: 'collection',
		fields: {
			id: { kind: 'text', storage: 'column', columnType: 'text' },
			key: { kind: 'text', storage: 'column', columnType: 'text', unique: true },
			url: { kind: 'text', storage: 'column', columnType: 'text' },
			mime: { kind: 'text', storage: 'column', columnType: 'text' },
			size: { kind: 'integer', storage: 'column', columnType: 'integer' },
			width: { kind: 'integer', storage: 'column', columnType: 'integer' },
			height: { kind: 'integer', storage: 'column', columnType: 'integer' },
			alt: { kind: 'text', storage: 'column', columnType: 'text' },
			createdAt: { kind: 'date', storage: 'column', columnType: 'integer' },
		},
	},
};

/**
 * Single source of truth: merge user collections + plugin collections + system collections.
 * Adapters, CLI generators, and the runtime all call this — never reach into config.collections directly.
 */
export function getCmsTables<C extends CollectionsRecord>(config: CmsConfig<C>): SchemaIR<C> {
	const collections: Record<string, CollectionDef> = { ...SYSTEM_COLLECTIONS };

	for (const plugin of config.plugins ?? []) {
		if (!plugin.schema) continue;
		for (const [name, def] of Object.entries(plugin.schema.collections)) {
			if (collections[name]) {
				throw new Error(
					`[better-cms] collection "${name}" declared by plugin "${plugin.id}" already exists`,
				);
			}
			collections[name] = def;
		}
	}

	for (const [name, def] of Object.entries(config.collections)) {
		if (collections[name]) {
			throw new Error(
				`[better-cms] collection "${name}" collides with system or plugin collection`,
			);
		}
		collections[name] = withDefaults(def);
	}

	return { collections } as SchemaIR<C>;
}

function withDefaults(def: CollectionDef): CollectionDef {
	const fields = { ...def.fields };
	if (!fields.id) {
		fields.id = { kind: 'text', storage: 'column', columnType: 'text' };
	}
	if (def.timestamps !== false) {
		if (!fields.createdAt)
			fields.createdAt = { kind: 'date', storage: 'column', columnType: 'integer' };
		if (!fields.updatedAt)
			fields.updatedAt = { kind: 'date', storage: 'column', columnType: 'integer' };
	}
	return { ...def, fields };
}
