import type { FieldDef } from '@better-cms/core';
import { z } from 'zod';
import { baseZodType, zodToField } from './walker.js';

const utcMidnight = (d: Date): Date =>
	new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Map a transport value onto a `Date`.
 *
 * JSON and FormData carry dates as strings, but authors write `z.date()`.
 * ISO-8601 strings (and `YYYY-MM-DD`, read as UTC midnight) become instants.
 * A `dateOnly` field is a calendar date: whatever instant arrives is reduced
 * to 00:00:00Z of its UTC day. Anything unparseable is returned untouched so
 * the author's schema reports the error.
 */
export function coerceDate(value: unknown, dateOnly: boolean): unknown {
	if (typeof value !== 'string' && !(value instanceof Date)) return value;
	const d = typeof value === 'string' ? new Date(value) : value;
	if (Number.isNaN(d.getTime())) return value;
	return dateOnly ? utcMidnight(d) : d;
}

export const isDateOnly = (ir: FieldDef): boolean => ir.editor?.props?.dateOnly === true;

/** Wrap a top-level date field so API callers can send ISO strings without the author writing `z.coerce`. */
export function withDateCoercion(schema: z.ZodType): z.ZodType {
	if (baseZodType(schema) !== 'date') return schema;
	const dateOnly = isDateOnly(zodToField(schema));
	return z.preprocess((v) => coerceDate(v, dateOnly), schema) as unknown as z.ZodType;
}
