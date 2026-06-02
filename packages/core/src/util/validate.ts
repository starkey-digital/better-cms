import type { CollectionDef, FieldDef } from '../ir/types.js';

/** Per-field codec returned by {@link getFieldCodec}. */
interface FieldCodec {
	serialize(value: unknown): unknown;
	deserialize(value: unknown): unknown;
}

/**
 * Single dispatch for field-level encode/decode logic.
 * Both serializeRow and deserializeRow use this so the two sides stay symmetric.
 */
export function getFieldCodec(field: FieldDef): FieldCodec {
	if (field.storage === 'json') {
		return {
			serialize: (v) => (typeof v === 'string' ? v : JSON.stringify(v)),
			deserialize: (v) => {
				if (typeof v !== 'string') return v;
				try {
					return JSON.parse(v);
				} catch {
					return v;
				}
			},
		};
	}
	if (field.scalarType === 'boolean') {
		return {
			serialize: (v) => (v ? 1 : 0),
			deserialize: (v) => v === 1 || v === true || v === '1',
		};
	}
	if (field.scalarType === 'date') {
		return {
			serialize: (v) => (v instanceof Date ? v.getTime() : v),
			deserialize: (v) => {
				// Numeric epoch (common path — preserved exactly)
				if (typeof v === 'number') return new Date(v);
				// ISO string surviving a JSON round-trip
				if (typeof v === 'string' && v.length > 0) {
					const d = new Date(v);
					if (!Number.isNaN(d.getTime())) return d;
				}
				return v;
			},
		};
	}
	return { serialize: (v) => v, deserialize: (v) => v };
}

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
		out[name] = getFieldCodec(field).serialize(value);
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
		out[name] = getFieldCodec(field).deserialize(value);
	}
	return out;
}
