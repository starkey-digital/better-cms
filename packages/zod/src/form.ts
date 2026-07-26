import type { FieldDef } from '@better-cms/core';
import { z } from 'zod';
import { baseZodType, zodToField } from './walker.js';

/**
 * Build the FormData-facing variant of a collection's create schema.
 *
 * `FormData` carries everything as strings, so a schema written in domain
 * terms (`z.boolean()`, `z.number()`, `z.date()`) rejects its own form's
 * submission. Each field is wrapped in a preprocess step that maps the wire
 * representation back to the declared type, letting the same schema serve
 * `form(schema, handler)` and `command(schema, handler)`.
 *
 * `id` is added as optional so one schema covers both create and edit — the
 * handler branches on its presence.
 */
export function toFormSchema(shape: Record<string, z.ZodType>): z.ZodObject {
	const out: Record<string, z.ZodType> = {};
	for (const [name, field] of Object.entries(shape)) {
		const ir = zodToField(field);
		const isString = baseZodType(field) === 'string';
		out[name] = z.preprocess(
			(value) => coerceFormValue(ir, isString, value),
			field,
		) as unknown as z.ZodType;
	}
	out.id = z.string().optional();
	return z.object(out);
}

/**
 * Map one raw form value onto the field's declared type.
 *
 * An empty string means "left blank". For an optional field that has to
 * become `undefined` so the field is treated as absent rather than as an
 * empty value — otherwise `z.string().email().optional()` fails on an
 * untouched input. Required fields keep the empty string so the schema
 * reports its own "required" message instead of a type mismatch.
 */
function coerceFormValue(ir: FieldDef, isString: boolean, value: unknown): unknown {
	if (typeof value !== 'string') return value;
	if (value === '') return ir.required ? value : undefined;

	// Never re-parse a field the schema declares as a string. `richText()` is a
	// string stored as json, so parsing here would turn a body of `2024` into a
	// number and reject it as "expected string".
	if (ir.storage === 'json' && !isString) {
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}

	switch (ir.scalarType) {
		case 'boolean':
			// An unchecked box submits nothing at all, so absence (not "false") is the off state.
			return value === 'on' || value === 'true' || value === '1';
		case 'number':
		case 'integer': {
			const n = Number(value);
			return Number.isNaN(n) ? value : n;
		}
		case 'date': {
			const d = new Date(value);
			return Number.isNaN(d.getTime()) ? value : d;
		}
		default:
			return value;
	}
}
