import type { CollectionDef, FieldDef } from '../ir/types.js';

/** Serialize a row according to field storage hints. JSON fields get stringified. */
export function serializeRow(
	def: CollectionDef,
	data: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(data)) {
		const field: FieldDef | undefined = def.fields[name];
		if (!field) {
			out[name] = value;
			continue;
		}
		if (value === undefined || value === null) {
			out[name] = value;
			continue;
		}
		if (field.storage === 'json') {
			out[name] = typeof value === 'string' ? value : JSON.stringify(value);
		} else if (field.scalarType === 'boolean') {
			out[name] = value ? 1 : 0;
		} else if (field.scalarType === 'date') {
			out[name] = value instanceof Date ? value.getTime() : value;
		} else {
			out[name] = value;
		}
	}
	return out;
}

/**
 * Coerce a string value (querystring, form, etc.) to the field's runtime type.
 * Boolean → libsql expects a real bool/0/1, so `'true'` strings would otherwise
 * miss the index. Numeric and date follow standard parse rules.
 */
export function coerceScalar(field: FieldDef | undefined, raw: string): unknown {
	if (!field) return raw;
	if (field.scalarType === 'boolean') return raw === 'true' || raw === '1';
	if (field.scalarType === 'integer' || field.scalarType === 'number') return Number(raw);
	if (field.scalarType === 'date') return new Date(raw);
	return raw;
}

/**
 * Inverse of serializeRow. Drops null values entirely so optional zod fields
 * (which accept `T | undefined`, not `T | null`) validate cleanly on round-trip
 * read → edit → save. Sqlite stores absent optionals as null; surfacing that
 * as `undefined` matches the zod schema author's intent.
 */
export function deserializeRow(
	def: CollectionDef,
	data: Record<string, unknown>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [name, value] of Object.entries(data)) {
		if (value === null) continue;
		if (value === undefined) continue;
		const field: FieldDef | undefined = def.fields[name];
		if (!field) {
			out[name] = value;
			continue;
		}
		if (field.storage === 'json' && typeof value === 'string') {
			try {
				out[name] = JSON.parse(value);
			} catch {
				out[name] = value;
			}
		} else if (field.scalarType === 'boolean') {
			out[name] = value === 1 || value === true || value === '1';
		} else if (field.scalarType === 'date' && typeof value === 'number') {
			out[name] = new Date(value);
		} else {
			out[name] = value;
		}
	}
	return out;
}
