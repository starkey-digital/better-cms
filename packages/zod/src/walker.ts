import type { FieldDef, FieldsRecord } from '@better-cms/core';
import type { z } from 'zod';
import { type BcmsFieldMeta, bcmsRegistry } from './registry.js';

interface ZodLike {
	_zod: { def: ZodDef };
}

interface ZodDef {
	type: string;
	innerType?: ZodLike;
	defaultValue?: unknown;
	element?: ZodLike;
	shape?: Record<string, ZodLike>;
	entries?: Record<string, string | number>;
	format?: string;
	checks?: Array<{ _zod?: { def?: { format?: string; check?: string } } }>;
}

const SYSTEM_DEFAULTS: FieldsRecord = {
	id: { kind: 'text', storage: 'column', columnType: 'text', scalarType: 'string' },
	createdAt: { kind: 'date', storage: 'column', columnType: 'integer', scalarType: 'date' },
	updatedAt: { kind: 'date', storage: 'column', columnType: 'integer', scalarType: 'date' },
};

/**
 * Walk a `z.object({...})` schema and emit the IR `FieldsRecord` the rest of
 * better-cms consumes (drizzle codegen, admin widgets, MCP descriptors,
 * runtime apply pipeline). Auto-injects system fields (id/createdAt/updatedAt)
 * if absent from the user's schema.
 */
export function zodToFields(objectSchema: z.ZodType): FieldsRecord {
	const def = (objectSchema as unknown as ZodLike)._zod.def;
	if (def.type !== 'object' || !def.shape) {
		throw new Error(
			'[better-cms/zod] collection schema must be a z.object({...}) at the top level',
		);
	}
	const out: FieldsRecord = {};
	for (const [name, schema] of Object.entries(def.shape)) {
		out[name] = zodToField(schema as unknown as z.ZodType);
	}
	for (const [name, fallback] of Object.entries(SYSTEM_DEFAULTS)) {
		if (!out[name]) out[name] = fallback;
	}
	return out;
}

function zodToField(schema: z.ZodType): FieldDef {
	let inner = schema as unknown as ZodLike;
	let required = true;
	let defaultValue: unknown;

	while (true) {
		const def = inner._zod.def;
		if (def.type === 'optional' || def.type === 'nullable') {
			required = false;
			inner = def.innerType!;
		} else if (def.type === 'default' || def.type === 'prefault') {
			defaultValue =
				typeof def.defaultValue === 'function'
					? (def.defaultValue as () => unknown)()
					: def.defaultValue;
			required = false;
			inner = def.innerType!;
		} else if (def.type === 'nonoptional') {
			required = true;
			inner = def.innerType!;
		} else {
			break;
		}
	}

	const meta = readMeta(schema as unknown as ZodLike) ?? readMeta(inner);
	const innerDef = inner._zod.def;
	const base: Partial<FieldDef> = { required };
	if (defaultValue !== undefined) base.defaultValue = defaultValue;
	if (meta?.unique) base.unique = true;
	if (meta?.indexed) base.indexed = true;

	if (meta?.kind === 'relation' && meta.relation) {
		const many = meta.relation.many;
		// `target` carries a `CollectionDef`/thunk here; `defineCMS()` swaps it
		// for the registered name string before any consumer sees it.
		return {
			...base,
			kind: 'relation',
			storage: many ? 'json' : 'column',
			columnType: 'text',
			scalarType: many ? undefined : 'string',
			indexed: !many,
			relation: {
				target: meta.relation.target as unknown as string,
				many,
				onDelete: meta.relation.onDelete ?? 'set null',
			},
			editor: { component: 'RelationField', props: { many } },
		};
	}

	if (meta?.kind === 'richText') {
		return {
			...base,
			kind: 'richText',
			storage: 'json',
			columnType: 'text',
			editor: { component: 'RichTextField', props: { impl: 'tiptap' } },
			llm: {
				describe:
					'Rich text content stored as a structured document (ProseMirror/Tiptap-compatible JSON).',
			},
		};
	}

	if (meta?.kind === 'image') {
		return {
			...base,
			kind: 'image',
			storage: 'json',
			columnType: 'text',
			editor: { component: 'ImageField' },
			llm: {
				describe: 'Reference to an uploaded image. Stored as { key, url, alt, width, height }.',
			},
		};
	}
	if (meta?.kind === 'file') {
		return {
			...base,
			kind: 'file',
			storage: 'json',
			columnType: 'text',
			editor: { component: 'FileField' },
		};
	}

	if (meta?.kind === 'slug') {
		return {
			...base,
			kind: 'slug',
			storage: 'column',
			columnType: 'text',
			scalarType: 'string',
			unique: base.unique ?? true,
			indexed: true,
			editor: { component: 'SlugField' },
		};
	}

	switch (innerDef.type) {
		case 'string':
			return {
				...base,
				kind: 'text',
				storage: 'column',
				columnType: 'text',
				scalarType: 'string',
				editor: { component: 'TextField', props: { multiline: false } },
			};
		case 'number': {
			const isInt = isIntegerNumber(innerDef);
			return {
				...base,
				kind: isInt ? 'integer' : 'number',
				storage: 'column',
				columnType: isInt ? 'integer' : 'real',
				scalarType: isInt ? 'integer' : 'number',
				editor: { component: 'NumberField' },
			};
		}
		case 'bigint':
			return {
				...base,
				kind: 'integer',
				storage: 'column',
				columnType: 'integer',
				scalarType: 'integer',
				editor: { component: 'NumberField' },
			};
		case 'boolean':
			return {
				...base,
				kind: 'boolean',
				storage: 'column',
				columnType: 'integer',
				scalarType: 'boolean',
				editor: { component: 'BooleanField' },
			};
		case 'date':
			return {
				...base,
				kind: 'date',
				storage: 'column',
				columnType: 'integer',
				scalarType: 'date',
				editor: { component: 'DateField' },
			};
		case 'enum': {
			const entries = innerDef.entries ?? {};
			const options = Object.values(entries).filter((v): v is string => typeof v === 'string');
			return {
				...base,
				kind: 'select',
				storage: 'column',
				columnType: 'text',
				scalarType: 'string',
				options,
				editor: { component: 'SelectField', props: { options } },
			};
		}
		case 'array': {
			const elemSchema = innerDef.element as unknown as z.ZodType;
			const of = zodToField(elemSchema);
			return {
				...base,
				kind: 'array',
				storage: 'json',
				columnType: 'text',
				array: { of },
				editor: { component: 'ArrayField' },
			};
		}
		case 'object': {
			const shape = innerDef.shape ?? {};
			const fields: FieldsRecord = {};
			for (const [name, sub] of Object.entries(shape)) {
				fields[name] = zodToField(sub as unknown as z.ZodType);
			}
			return {
				...base,
				kind: 'object',
				storage: 'json',
				columnType: 'text',
				object: { fields },
				editor: { component: 'ObjectField' },
			};
		}
		case 'unknown':
		case 'any':
		case 'union':
		case 'discriminated_union':
		case 'intersection':
		case 'transform':
		case 'pipe':
		case 'lazy':
		case 'record':
		case 'map':
		case 'set':
		case 'tuple':
		case 'literal':
			return {
				...base,
				kind: 'json',
				storage: 'json',
				columnType: 'text',
				editor: { component: 'JsonField' },
			};
	}

	return {
		...base,
		kind: 'json',
		storage: 'json',
		columnType: 'text',
		editor: { component: 'JsonField' },
	};
}

function readMeta(s: ZodLike): BcmsFieldMeta | undefined {
	return bcmsRegistry.get(s as unknown as Parameters<typeof bcmsRegistry.get>[0]) as
		| BcmsFieldMeta
		| undefined;
}

function isIntegerNumber(def: ZodDef): boolean {
	if (def.format && /int/i.test(def.format)) return true;
	for (const c of def.checks ?? []) {
		const f = c?._zod?.def?.format ?? c?._zod?.def?.check ?? '';
		if (f && /int/i.test(f)) return true;
	}
	return false;
}
