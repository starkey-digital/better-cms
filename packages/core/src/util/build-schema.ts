import * as v from 'valibot';
import type { CollectionDef, FieldDef } from '../ir/types.js';

export type SchemaVariant = 'create' | 'update' | 'full';

const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

/**
 * Derive a Standard-Schema-compatible validator from a CollectionDef.
 * Drop-in for SvelteKit `query` / `command`, tRPC, hono/zod, anything that
 * accepts Standard Schema (this returns a valibot schema; valibot already
 * conforms).
 *
 *   variant 'create' — system fields excluded (id, createdAt, updatedAt
 *                      are server-set). Required validation honoured.
 *   variant 'update' — every field optional, id required as the lookup key.
 *   variant 'full'   — every field present per the def (used for validating
 *                      complete server-returned rows).
 */
export function buildSchema(def: CollectionDef, variant: SchemaVariant = 'full') {
	const shape: Record<string, v.GenericSchema> = {};
	for (const [name, field] of Object.entries(def.fields)) {
		if (SYSTEM_FIELDS.has(name)) {
			if (variant === 'update' && name === 'id') shape[name] = v.string();
			else if (variant === 'full') shape[name] = v.optional(fieldSchema(field));
			continue;
		}
		const required = field.validation?.required ?? false;
		const base = fieldSchema(field);
		shape[name] = variant === 'update' || !required ? v.optional(base) : base;
	}
	return v.object(shape);
}

function fieldSchema(field: FieldDef): v.GenericSchema {
	let base: v.GenericSchema = scalarBase(field);
	const checks: v.GenericPipeAction[] = [];
	const val = field.validation;

	if (val?.enum && val.enum.length > 0) {
		const variants = val.enum.map((e) => v.literal(e as never)) as unknown as [
			v.GenericSchema,
			...v.GenericSchema[],
		];
		base = v.union(variants);
	} else if (field.scalarType === 'string') {
		if (val?.min != null) checks.push(v.minLength(val.min) as v.GenericPipeAction);
		if (val?.max != null) checks.push(v.maxLength(val.max) as v.GenericPipeAction);
		if (val?.pattern) checks.push(v.regex(new RegExp(val.pattern)) as v.GenericPipeAction);
	} else if (field.scalarType === 'number' || field.scalarType === 'integer') {
		if (val?.min != null) checks.push(v.minValue(val.min) as v.GenericPipeAction);
		if (val?.max != null) checks.push(v.maxValue(val.max) as v.GenericPipeAction);
	}

	if (field.kind === 'array' && field.array) {
		base = v.array(fieldSchema(field.array.of));
		if (val?.min != null) checks.push(v.minLength(val.min) as v.GenericPipeAction);
		if (val?.max != null) checks.push(v.maxLength(val.max) as v.GenericPipeAction);
	} else if (field.kind === 'object' && field.object) {
		const inner: Record<string, v.GenericSchema> = {};
		for (const [n, f] of Object.entries(field.object.fields)) {
			const s = fieldSchema(f);
			inner[n] = f.validation?.required ? s : v.optional(s);
		}
		base = v.object(inner);
	}

	return checks.length
		? (v.pipe(base, ...(checks as [v.GenericPipeAction])) as v.GenericSchema)
		: base;
}

function scalarBase(field: FieldDef): v.GenericSchema {
	if (field.kind === 'image' || field.kind === 'file') {
		return v.object({
			key: v.string(),
			url: v.string(),
			mime: v.optional(v.string()),
			size: v.optional(v.number()),
			width: v.optional(v.number()),
			height: v.optional(v.number()),
			alt: v.optional(v.string()),
		});
	}
	if (field.kind === 'richText' || field.kind === 'json') return v.unknown();
	if (field.kind === 'relation' && field.relation) {
		return field.relation.many ? v.array(v.string()) : v.string();
	}
	switch (field.scalarType) {
		case 'boolean':
			return v.boolean();
		case 'integer':
			return v.pipe(v.number(), v.integer());
		case 'number':
			return v.number();
		case 'date':
			return v.date();
		default:
			return v.string();
	}
}
