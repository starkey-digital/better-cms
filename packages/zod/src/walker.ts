import type { FieldDef, FieldsRecord } from '@better-cms/core';
import { z } from 'zod';
import { type BcmsFieldMeta, bcmsRegistry } from './registry.js';

export interface ZodLike {
	_zod: { def: ZodDef };
}

export interface ZodDef {
	type: string;
	innerType?: ZodLike;
	defaultValue?: unknown;
	element?: ZodLike;
	shape?: Record<string, ZodLike>;
	entries?: Record<string, string | number>;
	format?: string;
	checks?: Array<{ _zod?: { def?: { format?: string; check?: string } } }>;
}

/** System fields automatically injected into every collection. */
export const SYSTEM_FIELDS = ['id', 'createdAt', 'updatedAt'] as const;
export type SystemField = (typeof SYSTEM_FIELDS)[number];

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

/** Walk one field schema to its IR. Exported so the form-schema builder can reuse the unwrap + type detection. */
export function zodToField(schema: z.ZodType): FieldDef {
	const adminMeta: ZodAdminMeta = {};
	const field = walkField(schema, adminMeta);
	return applyAdminMeta(field, adminMeta);
}

/** Display metadata authors attach with `.meta()` / `.describe()`. */
interface ZodAdminMeta {
	label?: string;
	description?: string;
	placeholder?: string;
	multiline?: boolean;
	dateOnly?: boolean;
	hidden?: boolean;
	itemLabel?: string;
	/** Image crop shape(s): a width/height ratio, a list of them, or `'free'`. */
	aspect?: number | number[] | 'free';
	aspectLabel?: string | string[];
	/** Longest edge, in pixels, an uploaded image is downscaled to in the browser. */
	maxSize?: number;
}

const STRING_KEYS = ['label', 'description', 'placeholder', 'itemLabel'] as const;
const BOOLEAN_KEYS = ['multiline', 'dateOnly', 'hidden'] as const;

/**
 * Fold one schema layer's `.meta()` into `into`. Layers are visited outermost
 * first and the first writer wins, so meta on `z.string().meta(...).optional()`
 * and on `z.string().optional().meta(...)` both survive, and the outer one
 * takes precedence when both are set.
 */
function collectMeta(layer: ZodLike, into: ZodAdminMeta): void {
	const meta = z.globalRegistry.get(layer as unknown as z.ZodType) as
		| Record<string, unknown>
		| undefined;
	if (!meta) return;
	for (const key of STRING_KEYS) {
		const v = meta[key];
		if (typeof v === 'string' && into[key] === undefined) into[key] = v;
	}
	for (const key of BOOLEAN_KEYS) {
		const v = meta[key];
		if (typeof v === 'boolean' && into[key] === undefined) into[key] = v;
	}
	if (into.aspect === undefined) {
		const a = meta.aspect;
		if (a === 'free' || (typeof a === 'number' && a > 0)) into.aspect = a;
		else if (Array.isArray(a) && a.every((n) => typeof n === 'number' && n > 0)) into.aspect = a;
	}
	const label = meta.aspectLabel;
	if (into.aspectLabel === undefined) {
		if (typeof label === 'string') into.aspectLabel = label;
		else if (Array.isArray(label) && label.every((l) => typeof l === 'string'))
			into.aspectLabel = label;
	}
	if (into.maxSize === undefined && typeof meta.maxSize === 'number' && meta.maxSize > 0) {
		into.maxSize = meta.maxSize;
	}
}

function applyAdminMeta(field: FieldDef, meta: ZodAdminMeta): FieldDef {
	if (meta.label !== undefined) field.label = meta.label;
	if (meta.description !== undefined) field.description = meta.description;
	if (meta.placeholder !== undefined) field.placeholder = meta.placeholder;
	if (meta.hidden) field.hidden = true;

	const props: Record<string, unknown> = { ...field.editor?.props };
	if (meta.multiline && field.kind === 'text') props.multiline = true;
	if (meta.dateOnly && field.kind === 'date') props.dateOnly = true;
	if (meta.itemLabel !== undefined && field.kind === 'array') props.itemLabel = meta.itemLabel;
	if (field.kind === 'image') {
		if (meta.aspect !== undefined) props.aspect = meta.aspect;
		if (meta.aspectLabel !== undefined) props.aspectLabel = meta.aspectLabel;
		if (meta.maxSize !== undefined) props.maxSize = meta.maxSize;
	}
	if (field.editor && Object.keys(props).length) field.editor = { ...field.editor, props };
	return field;
}

function walkField(schema: z.ZodType, adminMeta: ZodAdminMeta): FieldDef {
	let inner = schema as unknown as ZodLike;
	let required = true;
	let defaultValue: unknown;

	while (true) {
		collectMeta(inner, adminMeta);
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
		} else if (def.type === 'catch') {
			// z.catch() provides a fallback value — treat as having a default (not required)
			defaultValue =
				typeof def.defaultValue === 'function'
					? (def.defaultValue as () => unknown)()
					: def.defaultValue;
			required = false;
			inner = def.innerType!;
		} else if (def.type === 'readonly') {
			inner = def.innerType!;
		} else {
			break;
		}
	}

	// First lookup covers the outermost schema (e.g. registered before .optional());
	// second covers the unwrapped inner (e.g. registered on the base type itself).
	const meta = readMeta(schema as unknown as ZodLike) ?? readMeta(inner);
	const innerDef = inner._zod.def;
	const base: Partial<FieldDef> = { required };
	if (defaultValue !== undefined) base.defaultValue = defaultValue;
	if (meta?.unique) base.unique = true;
	if (meta?.indexed) base.indexed = true;

	if (meta?.kind === 'relation' && meta.relation) {
		const many = meta.relation.many;
		// `target` carries a `CollectionDef`/thunk here; `createCms()` swaps it
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
				// onDelete is always set by relation() in helpers.ts; no fallback needed here.
				onDelete: meta.relation.onDelete,
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
		default:
			return {
				...base,
				kind: 'json',
				storage: 'json',
				columnType: 'text',
				editor: { component: 'JsonField' },
			};
	}
}

/**
 * The underlying zod type name, with `optional` / `default` / `nullable` /
 * `catch` / `readonly` wrappers peeled off. Lets callers ask what a field
 * *is* rather than inferring it from the storage hint — `richText()` is a
 * plain string that happens to be stored as json, and the two answers differ.
 */
export function baseZodType(schema: z.ZodType): string {
	let inner = schema as unknown as ZodLike;
	while (true) {
		const def = inner._zod.def;
		if (
			(def.type === 'optional' ||
				def.type === 'nullable' ||
				def.type === 'default' ||
				def.type === 'prefault' ||
				def.type === 'nonoptional' ||
				def.type === 'catch' ||
				def.type === 'readonly') &&
			def.innerType
		) {
			inner = def.innerType;
			continue;
		}
		return def.type;
	}
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
